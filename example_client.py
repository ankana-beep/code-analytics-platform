"""Example Python client for the current basic-scan API."""
import requests
import time
from typing import Optional, Dict


class CodeAnalyticsClient:
    """Python client for Code Analytics Platform API."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api/v1"
    
    def create_scan(
        self,
        repository_url: str,
        branch: str = "main",
    ) -> Dict:
        """
        Create a new public GitHub repository scan.
        
        Args:
            repository_url: Public GitHub repository URL
            branch: Git branch to scan
            
        Returns:
            Completed scan payload
        """
        response = requests.post(
            f"{self.api_url}/basic-scans",
            json={
                "repository_url": repository_url,
                "branch": branch,
            }
        )
        response.raise_for_status()
        return response.json()
    
    def get_scan(self, scan_id: str) -> Dict:
        """
        Get scan details.
        
        Args:
            scan_id: Scan identifier
            
        Returns:
            Scan details
        """
        response = requests.get(f"{self.api_url}/basic-scans/{scan_id}")
        response.raise_for_status()
        return response.json()
    
    def get_scan_status(self, scan_id: str) -> Dict:
        """
        Get scan status and progress.
        
        Args:
            scan_id: Scan identifier
            
        Returns:
            Status and progress information
        """
        response = requests.get(f"{self.api_url}/basic-scans/{scan_id}/status")
        response.raise_for_status()
        return response.json()
    
    def list_scans(
        self,
        skip: int = 0,
        limit: int = 10,
    ) -> list:
        """
        List scans with pagination.
        
        Args:
            skip: Number of records to skip
            limit: Maximum records to return
            
        Returns:
            List of scans
        """
        params = {"skip": skip, "limit": limit}
        response = requests.get(f"{self.api_url}/basic-scans", params=params)
        response.raise_for_status()
        return response.json()
    
    def wait_for_scan(
        self,
        scan_id: str,
        timeout: int = 3600,
        poll_interval: int = 5
    ) -> Dict:
        """
        Wait for scan to complete.
        
        Args:
            scan_id: Scan identifier
            timeout: Maximum wait time in seconds
            poll_interval: Polling interval in seconds
            
        Returns:
            Final scan details
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_scan_status(scan_id)
            
            print(f"Status: {status['status']}, Progress: {status['progress']:.1f}%")
            
            if status['status'] in ['completed', 'failed', 'cancelled']:
                return self.get_scan(scan_id)
            
            time.sleep(poll_interval)
        
        raise TimeoutError(f"Scan did not complete within {timeout} seconds")
    
    def health_check(self) -> Dict:
        """Check API health."""
        response = requests.get(f"{self.api_url}/health")
        response.raise_for_status()
        return response.json()


# Example usage
if __name__ == "__main__":
    # Initialize client
    client = CodeAnalyticsClient()
    
    # Check health
    print("Checking API health...")
    health = client.health_check()
    print(f"API Status: {health['status']}")
    print()
    
    # Create a scan
    print("Creating scan...")
    scan_response = client.create_scan(
        repository_url="https://github.com/octocat/Hello-World",
        branch="main",
    )
    
    scan_id = scan_response["id"]
    print(f"Scan created: {scan_id}")
    print()
    
    # Wait for scan to complete
    print("Waiting for scan to complete...")
    try:
        scan = client.wait_for_scan(scan_id, timeout=600)
        
        print("\nScan completed!")
        print(f"Status: {scan['status']}")
        
        if scan.get("metrics"):
            metrics = scan["metrics"]
            print(f"\nResults:")
            print(f"  Total Files: {metrics['total_files']}")
            print(f"  Total Lines: {metrics['total_lines']}")
            print(f"  Code Lines: {metrics['code_lines']}")
            print(f"  Comment Lines: {metrics['comment_lines']}")
            print(f"  TODO Count: {metrics['todo_count']}")
            print(f"  FIXME Count: {metrics['fixme_count']}")
            print(f"  Scan Duration: {metrics['scan_duration']}s")
    
    except TimeoutError as e:
        print(f"Error: {e}")
    except Exception as e:
        print(f"Error: {e}")
