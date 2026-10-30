"""Synthetic Chinese resume using a predefined CID encoding (external PDF.js CMap).

All names, employers and contacts are fictional. The deliberately English language tag
exercises the body-language override. No font or ToUnicode mapping is embedded.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.pdfdoc import PDFString

root = Path(__file__).resolve().parents[2]
target = root / "tests/e2e/fixtures/chinese-cmap-resume.pdf"
pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
document = canvas.Canvas(str(target), pagesize=(595, 842), pageCompression=0)
document._doc.Catalog.Lang = PDFString("en-US")
document.setTitle("Synthetic Chinese CMap ATS fixture")
rows = [
    ("张三", 20),
    ("Java 后端开发", 12),
    ("zhangsan@example.com | 13912345678 | 杭州", 10),
    ("教育背景", 14),
    ("虚构大学 | 软件工程本科 | 2022.09 - 2026.06", 11),
    ("主修数据库系统、操作系统、计算机网络与软件工程。", 11),
    ("专业技能", 14),
    ("Java、Spring Boot、MySQL、Redis、单元测试、性能优化", 11),
    ("实习经历", 14),
    ("虚构科技 | 后端开发实习生 | 2025.03 - 2025.08", 11),
    ("参与订单接口开发，使用 Java 和 Spring Boot 完成接口联调。", 11),
    ("使用 MySQL 分析索引问题，与团队协同完成单元测试。", 11),
    ("项目经历", 14),
    ("虚构订单项目 | 2025.09 - 至今", 11),
    ("负责接口与数据库设计，使用 Redis 缓存商品查询结果。", 11),
    ("参与性能优化和错误处理，记录测试环境与结果口径。", 11),
]
y = 790
for text, size in rows:
    document.setFont("STSong-Light", size)
    document.drawString(48, y, text)
    y -= 32 if size >= 14 else 24
document.save()
print(target)
