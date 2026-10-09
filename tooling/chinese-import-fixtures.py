"""Build deterministic, fictional OOXML input fixtures; no office dependency."""

from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests/e2e/fixtures"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
PERSONAL = [
    "姓名：欧阳明月 性别：女 年龄：28岁 民族：汉族",
    "求职意向：Java 后端开发工程师",
    "邮箱：import-fixture@example.test 电话：13800138000",
    "政治面貌：中共党员 现居地：杭州",
    "详细地址：浙江省杭州市，西湖区示例路1号",
    "博客：https://example.test/blog GitHub：https://github.com/example",
]
BODY = [
    "教育背景", "示例大学  本科  软件工程  2020.09 - 2024.06",
    "工作经历", "示例科技有限公司  后端开发工程师  2024.07 - 至今",
    "负责接口开发、服务测试与技术方案设计", "专业技能", "Java, C++, Node.js, CI/CD",
    "自我评价", "具备团队协作能力，持续学习并参与技术方案设计。",
]


def p(text):
    return f'<w:p><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'


def make(name, table=False, personal_lines=PERSONAL, body_lines=BODY, headings=("个人信息", "个人简历")):
    refs = '<w:headerReference w:type="default" r:id="h1"/><w:footerReference w:type="default" r:id="f1"/>' if table else ""
    personal = "".join(
        f'<w:tr>{"".join(f"<w:tc>{p(cell)}</w:tc>" for cell in line.split(" ") if cell)}</w:tr>'
        for line in personal_lines
    ) if table else "".join(map(p, personal_lines))
    body = p(headings[0]) + (f"<w:tbl>{personal}</w:tbl>" if table else p(headings[1]) + personal)
    body += "".join(map(p, body_lines))
    section = f'<w:sectPr>{refs}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:bottom="1134" w:left="1134" w:right="1134"/></w:sectPr>'
    types = '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    rels = ""
    files = {
        "_rels/.rels": f'<Relationships xmlns="{REL}"><Relationship Id="doc" Type="{R}/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": f'<w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{body}{section}</w:body></w:document>',
    }
    if table:
        for kind, rid, text in [("header", "h1", "个人简历\n姓名：欧阳明月"), ("footer", "f1", "联系方式\n电话：13800138000")]:
            tag = "hdr" if kind == "header" else "ftr"
            files[f"word/{kind}1.xml"] = f'<w:{tag} xmlns:w="{W}">{"".join(map(p, text.splitlines()))}</w:{tag}>'
            types += f'<Override PartName="/word/{kind}1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.{kind}+xml"/>'
            rels += f'<Relationship Id="{rid}" Type="{R}/{kind}" Target="{kind}1.xml"/>'
        files["word/_rels/document.xml.rels"] = f'<Relationships xmlns="{REL}">{rels}</Relationships>'
    files["[Content_Types].xml"] = f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>{types}</Types>'
    with ZipFile(OUT / name, "w") as archive:
        for path, xml in sorted(files.items()):
            info = ZipInfo(path, (2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, xml.encode("utf-8"))


if __name__ == "__main__":
    make("chinese-import-paragraph.docx")
    make("chinese-import-table-header.docx", table=True)
    make("english-import-paragraph.docx", personal_lines=[
        "Full Name: Sarah Broad", "Email: sarah.broad@example.test Phone: +1 202 555 0123",
        "Job Objective: Software Engineer", "City: London",
    ], body_lines=[
        "Education", "Example University  Bachelor of Science  Computer Science  2020 - 2024",
        "Experience", "Example Company  Software Engineer  2024 - Present",
        "Designed reliable services and implemented unit tests for customer workflows.",
        "Skills", "Java, C++, Node.js, CI/CD",
    ], headings=("Personal Information", "Resume"))
