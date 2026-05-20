"""Reporting, export, and shareable report endpoints."""
import csv
from io import BytesIO, StringIO
from secrets import token_urlsafe
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.database import get_database
from app.core.security import get_current_user
from app.domain.models import ExecutiveSummary, Scan, ScanStatus, ShareReportResponse, User
from app.repositories.scan_repository import ScanRepository


router = APIRouter(prefix="/reports", tags=["reports"])


async def get_scan_repository(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> ScanRepository:
    return ScanRepository(db)


def ensure_scan_owner(scan: Scan, current_user: User) -> None:
    if scan.user_id and scan.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Scan not found")


def scan_filename(scan: Scan, suffix: str) -> str:
    name = scan.repository_path.rstrip("/").split("/")[-1] or "scan"
    return f"{name}-{scan.branch}-{scan.id}.{suffix}".replace(" ", "-")


def build_summary_rows(scan: Scan) -> List[List[str]]:
    metrics = scan.metrics
    if not metrics:
        return []

    return [
        ["Repository", scan.repository_path],
        ["Branch / Commit", scan.branch],
        ["Status", scan.status.value if hasattr(scan.status, "value") else str(scan.status)],
        ["Total Files", str(metrics.total_files)],
        ["Lines of Code", str(metrics.total_lines_of_code)],
        ["Comment Lines", str(metrics.total_comment_lines)],
        ["Blank Lines", str(metrics.total_blank_lines)],
        ["Docstring Coverage", f"{metrics.docstring_coverage:.1f}%"],
        ["Avg Complexity", f"{metrics.complexity_metrics.avg_cyclomatic_complexity:.1f}"],
        ["Maintainability", f"{metrics.complexity_metrics.avg_maintainability_index:.1f}"],
        ["TODOs", str(metrics.todo_count)],
        ["FIXMEs", str(metrics.fixme_count)],
        ["Dependencies", str(len(metrics.dependencies))],
        ["Scan Duration", f"{metrics.scan_duration:.1f}s"],
    ]


async def get_owned_scan(scan_id: str, repository: ScanRepository, current_user: User) -> Scan:
    scan = await repository.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    ensure_scan_owner(scan, current_user)
    return scan


@router.get("/executive-summary", response_model=ExecutiveSummary)
async def get_executive_summary(
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    scans = await repository.list_scans(skip=0, limit=100, user_id=current_user.id)
    completed = [scan for scan in scans if scan.status == ScanStatus.COMPLETED and scan.metrics]
    metric_count = len(completed) or 1

    return ExecutiveSummary(
        total_scans=len(scans),
        completed_scans=len([scan for scan in scans if scan.status == ScanStatus.COMPLETED]),
        failed_scans=len([scan for scan in scans if scan.status == ScanStatus.FAILED]),
        active_scans=len([scan for scan in scans if scan.status in [ScanStatus.QUEUED, ScanStatus.PROCESSING]]),
        repositories_scanned=len({scan.repository_path for scan in scans}),
        total_files=sum(scan.metrics.total_files for scan in completed if scan.metrics),
        total_lines_of_code=sum(scan.metrics.total_lines_of_code for scan in completed if scan.metrics),
        avg_complexity=sum(scan.metrics.complexity_metrics.avg_cyclomatic_complexity for scan in completed if scan.metrics) / metric_count,
        avg_doc_coverage=sum(scan.metrics.docstring_coverage for scan in completed if scan.metrics) / metric_count,
        total_todos=sum(scan.metrics.todo_count for scan in completed if scan.metrics),
        total_fixmes=sum(scan.metrics.fixme_count for scan in completed if scan.metrics),
        total_dependencies=sum(len(scan.metrics.dependencies) for scan in completed if scan.metrics),
        avg_scan_duration=sum(scan.metrics.scan_duration for scan in completed if scan.metrics) / metric_count,
    )


@router.get("/scans/{scan_id}/export.csv")
async def export_scan_csv(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    scan = await get_owned_scan(scan_id, repository, current_user)
    files = await repository.get_file_metrics(scan_id, skip=0, limit=1000)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Summary"])
    writer.writerows(build_summary_rows(scan))
    writer.writerow([])
    writer.writerow([
        "File",
        "Type",
        "LOC",
        "Comments",
        "Blank",
        "Cyclomatic Complexity",
        "Cognitive Complexity",
        "Maintainability",
        "TODOs",
        "FIXMEs",
        "Docs %",
    ])
    for file_metric in files:
        writer.writerow([
            file_metric.file_path,
            file_metric.file_type.value if hasattr(file_metric.file_type, "value") else str(file_metric.file_type),
            file_metric.lines_of_code,
            file_metric.comment_lines,
            file_metric.blank_lines,
            file_metric.cyclomatic_complexity,
            file_metric.cognitive_complexity,
            f"{file_metric.maintainability_index:.1f}",
            file_metric.todo_count,
            file_metric.fixme_count,
            f"{file_metric.docstring_coverage:.1f}",
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{scan_filename(scan, "csv")}"'}
    )


@router.get("/scans/{scan_id}/export.pdf")
async def export_scan_pdf(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    scan = await get_owned_scan(scan_id, repository, current_user)
    if not scan.metrics:
        raise HTTPException(status_code=400, detail="Scan has no metrics to export")

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, title="Code Analytics Scan Report")
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Code Analytics Scan Report", styles["Title"]),
        Paragraph(scan.repository_path, styles["Heading2"]),
        Paragraph(f"Branch / Commit: {scan.branch}", styles["Normal"]),
        Spacer(1, 12),
    ]
    table_data = [["Metric", "Value"], *build_summary_rows(scan)]
    table = Table(table_data, colWidths=[180, 300])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dce3ea")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
    ]))
    story.extend([table, Spacer(1, 16)])

    if scan.metrics.dependencies:
        deps = [["Dependency", "Usage Count"], *[
            [dependency.package_name, str(dependency.usage_count)]
            for dependency in scan.metrics.dependencies[:12]
        ]]
        dep_table = Table(deps, colWidths=[300, 120])
        dep_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dce3ea")),
        ]))
        story.extend([Paragraph("Top Dependencies", styles["Heading2"]), dep_table])

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{scan_filename(scan, "pdf")}"'}
    )


@router.post("/scans/{scan_id}/share", response_model=ShareReportResponse)
async def create_shareable_report(
    scan_id: str,
    repository: ScanRepository = Depends(get_scan_repository),
    current_user: User = Depends(get_current_user)
):
    scan = await get_owned_scan(scan_id, repository, current_user)
    token = scan.share_token or token_urlsafe(24)
    await repository.update_scan(scan_id, {"share_token": token})
    return ShareReportResponse(
        scan_id=scan_id,
        share_token=token,
        api_url=f"/api/v1/reports/share/{token}"
    )


@router.get("/share/{share_token}", response_model=Scan)
async def get_shared_report(
    share_token: str,
    repository: ScanRepository = Depends(get_scan_repository)
):
    scan = await repository.get_scan_by_share_token(share_token)
    if not scan:
        raise HTTPException(status_code=404, detail="Shared report not found")
    return scan
