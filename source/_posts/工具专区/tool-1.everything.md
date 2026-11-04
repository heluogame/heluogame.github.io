---
title: 【工具专区】文件快速索引工具 Everything
description: Everything
date: 2024-3-13 15:29:13
categories: [工具]
tags: [工具, 软件, everything, 文件搜索]
abbrlink: tool-1
cover: "https://i0.hdslb.com/bfs/new_dyn/940527a313730c98569ee3ca05d4f53f3461564132756358.png"
---
<a href="/posts/gzfjb0"><img src="https://i0.hdslb.com/bfs/new_dyn/d8e1f6ba152798182bd06b385586929d3546898971494830.jpg" alt="赞助广子"></a>

# 文件快速索引工具 Everything
![](https://i0.hdslb.com/bfs/new_dyn/940527a313730c98569ee3ca05d4f53f3461564132756358.png)
Windows 自带的搜索有多慢，用过的人都有体会：输入关键词，转圈，等半天，最后还可能告诉你「没有找到」。
Everything 解决的就是这件事。
安装包不到 2 MB，界面朴素得有点简陋，但只要开始打字，结果就已经列出来了——几百万个文件同样是秒出。
如果系统盘是固态硬盘，建库通常几秒就结束了。

## 主要特点
- **启动快**：常驻内存，随开随用
- **占用低**：后台几乎不占 CPU，内存通常几十 MB
- **实时更新**：新建、删除、重命名立刻生效
- **多语言**：自带简体中文界面
- **便携版**：解压即用，不写注册表，可以放 U 盘
- **局域网共享**：内置 HTTP / FTP 服务器，手机和别的电脑能直接搜你机器上的文件
- **导出文件列表**：可以把搜索结果存成文本或 CSV，用来整理素材很方便

# 找游戏存档教程
{% bilibili BV1xN411J77y %}
如果播放器没加载出来，可以直接去 B 站看：[如何正确找到游戏存档位置（替换存档）](https://www.bilibili.com/video/BV1xN411J77y/)

存档文件通常藏在 `AppData`、`Documents` 或者游戏安装目录里，名字还未必叫 save。用 Everything 搜一下，比一层层翻文件夹快得多。

## 具体步骤

1. 打开 Everything，在搜索框输入游戏名（比如 `Hollow`）
2. 用扩展名过滤存档文件：`ext:sav`、`ext:dat`、`ext:slot`、`ext:profile`
3. 缩小范围：在关键词后面加路径，例如 `AppData 游戏名`
4. 右键结果 → 打开路径，就能定位到存档文件夹

常见存档位置：

| 位置 | 路径 |
| --- | --- |
| 漫游数据 | `%APPDATA%` |
| 本地数据 | `%LOCALAPPDATA%` |
| 我的文档 | `文档\游戏名` |
| 游戏本体 | 安装目录下的 `save` / `profile` / `savedata` |

---
{% tip success toc-heading %}
# Everything 工具 电脑版下载
{% endtip %}
{% panDownload %}
quark: https://pan.quark.cn/s/cadd2ea45bf3
{% endpanDownload %}