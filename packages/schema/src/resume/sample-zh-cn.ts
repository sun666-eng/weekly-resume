import type { ResumeData } from "./data";
import { sampleResumeData } from "./sample";

// Fictional one-page sample for the Chinese homepage and template gallery.
// It demonstrates problem-action-result writing without copying a real CV.
const data = structuredClone(sampleResumeData);

data.metadata.page.locale = "zh-CN";
data.metadata.layout.pages = [
	{ fullWidth: true, main: ["education", "experience", "projects", "skills"], sidebar: [] },
];
data.metadata.page.marginX = 32;
data.metadata.page.marginY = 22;
data.metadata.page.gapX = 5;
data.metadata.page.gapY = 4;
data.metadata.page.hideIcons = true;
data.metadata.page.hideSectionIcons = true;
data.metadata.design.colors.primary = "#111111";
data.metadata.design.colors.text = "#111111";
data.metadata.design.colors.background = "#ffffff";
data.metadata.typography.body.fontFamily = "Noto Sans SC";
data.metadata.typography.body.fontSize = 9.2;
data.metadata.typography.body.lineHeight = 1.46;
data.metadata.typography.heading.fontFamily = "Noto Sans SC";
data.metadata.typography.heading.fontSize = 11.2;
data.metadata.typography.heading.lineHeight = 1.3;

data.picture.hidden = true;
data.basics.name = "林知远";
data.basics.headline = "求职方向：Java 后端开发";
data.basics.email = "lin.zhiyuan@example.com";
data.basics.phone = "138 0000 0000";
data.basics.location = "杭州";
data.basics.website = { url: "", label: "" };
data.basics.customFields = [];
data.summary.hidden = true;
data.sections.profiles.hidden = true;

const education = data.sections.education.items[0];
if (!education) throw new Error("Chinese resume sample requires an education item");
data.sections.education.title = "教育经历";
data.sections.education.columns = 1;
education.school = "江城理工大学";
education.degree = "本科";
education.area = "软件工程";
education.grade = "GPA 3.7 / 4.0（专业前 15%）";
education.location = "";
education.period = "2022.09 — 2026.06";
education.website = { url: "", label: "", inlineLink: false };
education.description =
	"<ul><li><strong>语言：</strong>CET-6（518）；<strong>荣誉：</strong>校级一等奖学金（2024）</li><li><strong>主修课程：</strong>数据结构、操作系统、计算机网络、数据库系统</li></ul>";
data.sections.education.items = [education];

const experience = data.sections.experience.items[0];
if (!experience) throw new Error("Chinese resume sample requires an experience item");
data.sections.experience.title = "实习经历";
data.sections.experience.columns = 1;
experience.company = "星澜科技有限公司";
experience.position = "Java 后端开发实习生";
experience.location = "";
experience.period = "2025.03 — 2025.08";
experience.website = { url: "", label: "", inlineLink: false };
experience.description =
	"<ul><li>负责订单列表接口优化，使用 <strong>EXPLAIN</strong> 定位回表与排序开销，重构联合索引和分页方式；在 50 万条测试数据、300 QPS 压测下，将 <strong>P95 响应时间从 420 ms 降至 168 ms</strong>。</li><li>针对支付回调重复触发问题，设计 <strong>Redis 幂等键 + Lua 原子校验 + 数据库唯一约束</strong>的三层保护，连续 20 万次回放测试未产生重复订单。</li><li>使用 <strong>RocketMQ 延迟消息</strong>替代高频轮询关闭超时订单，并补充重试与死信处理；测试环境数据库扫描量下降约 <strong>72%</strong>。</li><li>统一错误码、Trace ID 与结构化日志，补齐 38 个核心接口测试用例，将同类问题的平均定位时间由约 40 分钟缩短至 15 分钟。</li></ul>";
data.sections.experience.items = [experience];

const [orderProject, kvProject] = data.sections.projects.items;
if (!orderProject || !kvProject) throw new Error("Chinese resume sample requires two project items");
data.sections.projects.title = "项目经历";
data.sections.projects.columns = 1;
orderProject.name = "FlashOrder 高并发订单系统";
orderProject.period = "2024.09 — 2025.02";
orderProject.website = { url: "", label: "", inlineLink: false };
orderProject.description =
	"<ul><li><strong>项目概述：</strong>面向课程秒杀场景的订单服务，技术栈为 Spring Boot、MySQL、Redis、RocketMQ。</li><li>将库存预热至 Redis，使用 <strong>Lua 脚本</strong>完成资格、库存与限购校验，并通过消息队列异步创建订单，削峰后核心接口可稳定处理 <strong>1,200 QPS</strong>。</li><li>采用数据库乐观锁与消费端幂等保证库存一致性；设计补偿任务处理异常消息，压测中未出现超卖，订单最终一致率达到 100%。</li><li>使用 JMeter 建立可重复的压测基线，记录吞吐量、P95 和错误率，针对连接池与慢 SQL 完成两轮优化。</li></ul>";
kvProject.name = "MiniKV 轻量级存储引擎";
kvProject.period = "2024.04 — 2024.08";
kvProject.website = { url: "", label: "", inlineLink: false };
kvProject.description =
	"<ul><li>基于 <strong>LSM Tree</strong> 实现 Put、Get、Delete 与范围查询，使用跳表维护 MemTable，并通过不可变表与后台 Compaction 控制读放大。</li><li>实现 <strong>WAL 预写日志、CRC 校验与故障恢复</strong>，在随机终止进程测试中可完整恢复已确认写入。</li><li>使用 JMH 对写入、随机读取和范围扫描进行基准测试，依据结果优化 Bloom Filter 与块缓存参数。</li></ul>";
data.sections.projects.items = [orderProject, kvProject];

data.sections.skills.title = "专业技能";
data.sections.skills.columns = 1;
data.sections.skills.layout = "inline";
data.sections.skills.keywordLayout = "inline";
const skillContent = [
	["Java 基础", "熟悉集合、异常、反射与并发编程；理解 JVM 内存模型、类加载和常用 GC 思路"],
	["开发框架", "熟悉 Spring Boot、MyBatis；理解 IOC、AOP 与常用 Web 开发模式"],
	["数据组件", "熟悉 MySQL 索引、事务与 MVCC；掌握 Redis 缓存策略、持久化与常见问题处理"],
	["工程实践", "了解 RocketMQ 消息可靠性；能够使用 Linux、Git、Docker、JUnit 与 JMeter"],
] as const;
data.sections.skills.items = data.sections.skills.items.slice(0, skillContent.length);
for (const [index, [name, description]] of skillContent.entries()) {
	const skill = data.sections.skills.items[index];
	if (!skill) throw new Error("Chinese resume sample is missing a skill item");
	skill.name = `${name}：`;
	skill.proficiency = "";
	skill.level = 0;
	skill.keywords = [description];
}

export const sampleResumeDataZhCn: ResumeData = data;
