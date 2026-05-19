"""
WebSocket router for real-time scan progress updates.
Implements pub/sub pattern using Redis for scalability.
"""
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, Set

from app.core.redis import get_redis, RedisManager
from app.core.logging import logger


router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    """
    Manages WebSocket connections and broadcasts.
    
    Implements efficient broadcasting using Redis pub/sub for
    horizontal scalability across multiple instances.
    """
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, scan_id: str, websocket: WebSocket):
        """
        Accept and register a new WebSocket connection.
        
        Args:
            scan_id: Scan identifier to subscribe to
            websocket: WebSocket connection
        """
        await websocket.accept()
        
        if scan_id not in self.active_connections:
            self.active_connections[scan_id] = set()
        
        self.active_connections[scan_id].add(websocket)
        
        logger.info(
            "WebSocket connected",
            extra={
                "scan_id": scan_id,
                "connections": len(self.active_connections[scan_id])
            }
        )
    
    def disconnect(self, scan_id: str, websocket: WebSocket):
        """
        Remove a WebSocket connection.
        
        Args:
            scan_id: Scan identifier
            websocket: WebSocket connection to remove
        """
        if scan_id in self.active_connections:
            self.active_connections[scan_id].discard(websocket)
            
            # Cleanup empty sets
            if not self.active_connections[scan_id]:
                del self.active_connections[scan_id]
        
        logger.info(
            "WebSocket disconnected",
            extra={
                "scan_id": scan_id,
                "remaining": len(self.active_connections.get(scan_id, []))
            }
        )
    
    async def broadcast(self, scan_id: str, message: dict):
        """
        Broadcast message to all connected clients for a scan.
        
        Args:
            scan_id: Scan identifier
            message: Message to broadcast
        """
        if scan_id not in self.active_connections:
            return
        
        # Remove disconnected clients
        disconnected = set()
        
        for websocket in self.active_connections[scan_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {str(e)}")
                disconnected.add(websocket)
        
        # Cleanup disconnected clients
        for websocket in disconnected:
            self.disconnect(scan_id, websocket)


# Global connection manager
manager = ConnectionManager()


@router.websocket("/scans/{scan_id}/progress")
async def scan_progress_websocket(
    websocket: WebSocket,
    scan_id: str,
    redis: RedisManager = Depends(get_redis)
):
    """
    WebSocket endpoint for real-time scan progress updates.
    
    Clients connect to this endpoint to receive live updates about
    scan progress including percentage, files processed, and current file.
    
    Args:
        websocket: WebSocket connection
        scan_id: Scan identifier to monitor
        redis: Redis manager for pub/sub
    """
    await manager.connect(scan_id, websocket)
    
    try:
        # Subscribe to Redis channel for this scan
        pubsub = await redis.subscribe_progress(scan_id)
        
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "scan_id": scan_id,
            "message": "Connected to scan progress stream"
        })
        
        # Listen for progress updates from Redis
        async def listen_redis():
            """Listen for progress updates from Redis pub/sub."""
            try:
                while True:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0
                    )
                    
                    if message and message['type'] == 'message':
                        data = json.loads(message['data'])
                        await websocket.send_json({
                            "type": "progress",
                            "data": data
                        })
            except Exception as e:
                logger.error(f"Redis listener error: {str(e)}")
        
        # Listen for client messages (heartbeat/ping)
        async def listen_client():
            """Listen for messages from the client."""
            try:
                while True:
                    data = await websocket.receive_text()
                    
                    # Handle ping/pong for keepalive
                    if data == "ping":
                        await websocket.send_json({
                            "type": "pong",
                            "timestamp": asyncio.get_event_loop().time()
                        })
            except WebSocketDisconnect:
                logger.info(f"Client disconnected from scan {scan_id}")
            except Exception as e:
                logger.error(f"Client listener error: {str(e)}")
        
        # Run both listeners concurrently
        await asyncio.gather(
            listen_redis(),
            listen_client(),
            return_exceptions=True
        )
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for scan {scan_id}")
    
    except Exception as e:
        logger.error(
            f"WebSocket error for scan {scan_id}: {str(e)}",
            exc_info=True
        )
    
    finally:
        manager.disconnect(scan_id, websocket)
        await pubsub.unsubscribe(f"scan:{scan_id}:progress")
        await pubsub.close()


@router.websocket("/test")
async def test_websocket(websocket: WebSocket):
    """
    Test WebSocket endpoint for connection testing.
    
    Clients can use this to verify WebSocket connectivity
    without needing a real scan.
    """
    await websocket.accept()
    
    try:
        # Send welcome message
        await websocket.send_json({
            "type": "welcome",
            "message": "WebSocket connection established"
        })
        
        # Echo messages back to client
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({
                "type": "echo",
                "message": data,
                "timestamp": asyncio.get_event_loop().time()
            })
    
    except WebSocketDisconnect:
        logger.info("Test WebSocket disconnected")
