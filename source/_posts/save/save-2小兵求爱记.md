---
title: "【游戏存档】小兵求爱记 Love Esquire V1.6.6 全图鉴回忆解锁与满属性开局存档"
description: "《小兵求爱记》游戏简介与画面展示，附 PC V1.6.6 全图鉴回忆解锁存档、第2天满属性强化开局及存档使用方法。"
date: 2026-10-27 18:00:00
categories: [存档]
tags: [游戏存档, 全cg存档, 满属性存档]
abbrlink: save2
card_status: 正常 #资源状态
card_size: 11KB / 13KB #资源大小
card_tags: [游戏存档, 全cg存档, 满属性存档] #资源标签
card_platforms: [windows] #支持平台windows, android, ios
card_review: "#存档使用方法：" #说明或评价
cover: "https://i0.hdslb.com/bfs/new_dyn/d718426a8b2b08698c1887540e3793733461564132756358.jpg"
---
<a href="/posts/gzfjb0"><img src="https://i0.hdslb.com/bfs/new_dyn/d8e1f6ba152798182bd06b385586929d3546898971494830.jpg@.webp" alt="赞助广子"></a>

# 【游戏存档】小兵求爱记 Love Esquire V1.6.6 全图鉴回忆解锁与满属性开局存档

![](https://i0.hdslb.com/bfs/new_dyn/d718426a8b2b08698c1887540e3793733461564132756358.jpg)

## 游戏简介
![](https://i0.hdslb.com/bfs/new_dyn/966c5a1a98f7ec326f9e836f5d84289f3461564132756358.gif)
《小兵求爱记》（Love Esquire）是 Yangyang Mobile 制作的一款恋爱喜剧视觉小说，融合角色养成与回合制 RPG 玩法。玩家扮演一名普通侍从，在奇幻世界中结识五位性格各异的女主角，通过日常对话、赠送礼物和剧情选择逐渐建立关系，体验不同角色的故事与结局。
![](https://i0.hdslb.com/bfs/new_dyn/15e92d2f7f0232f55e349c998b364ebc3461564132756358.gif)
![](https://i0.hdslb.com/bfs/new_dyn/a9d7a5e009c025fa1e58f66b89bffc993461564132756358.gif)
在恋爱互动之外，还需要安排训练，提升力量、智力和魅力，让角色成长与日常活动相互配合。出征时，侍从承担战斗支援工作，利用治疗、鼓舞等行动帮助骑士作战，也能搜集战利品。游戏将轻松幽默的对话、关系培养和冒险战斗穿插在一起，既可以慢慢体验角色路线，也可以围绕不同选择探索多种结局。
![](https://i0.hdslb.com/bfs/new_dyn/8ec272d8702f266293996a2dc2ee6f143461564132756358.gif)
游戏资料参考：[Yangyang Mobile 官方游戏介绍](https://yangyangmobile.itch.io/love-esquire)。

## 游戏画面

![小兵求爱记角色剧情画面](https://i0.hdslb.com/bfs/openplatform/a4ab1e4f1000c5b42d245edba1685cd266dd5f4f.jpg)
![小兵求爱记回合制战斗](https://i0.hdslb.com/bfs/openplatform/2cb8c810960c6d78766de4827b4ddf74e166601a.jpg)
![小兵求爱记酒馆对话选择](https://i0.hdslb.com/bfs/new_dyn/1885d6e68395e7b9804115f014d8600f3461564132756358.png)

## 存档内容

本次存档根据本地游戏自报的 **V1.6.6** 制作，适用于 **Windows PC、v10 存档格式**。提供两个包，按需要选择一个安装。

| 存档包 | 内容 |
| --- | --- |
| 全图鉴回忆解锁包，约 11KB | 解锁 317 个图鉴项目、844 条回忆入口，包含五位女主的恋爱、友情、坏结局及对应后日谈，另含 Hugh、Harem 等回忆。<br>只包含全局解锁文件，保留原有剧情存档槽。 |
| 全收集＋强化开局包，约 13KB | 包含上述全局解锁内容；<br>第 1 槽为原始开局，第 2 槽从第 2 天开始，力量、智力、魅力均为 10 级，金币为 999999。 |

强化档跳过了首日强制训练，避免满级属性与训练教学冲突，后续剧情流程尚未完整实测。
结局内容通过回忆菜单查看，包内没有为每位角色分别提供结局当天的剧情进度档。
全局文件还包含 **131 个游戏内成就标记**；
游戏连接 Steam 成功后会同步这些成就标记。
存档不包含游戏本体或 DLC 资源，相关画面仍需要对应资源文件。

# 存档使用方法：

1. 完全退出游戏，先选好要使用的存档包，两个包不需要叠加安装。
2. 按 **Win + R**，粘贴下面的路径并回车：

   ```text
   %USERPROFILE%\AppData\LocalLow\Yangyang Mobile\Love Esquire\State\v10
   ```

3. 先将整个 **v10 文件夹**复制一份备份。如果没有该目录，可以先进入游戏创建一次存档，再退出游戏。
4. 解压所选存档包，将包内 **v10 文件夹中的文件**复制到上面的目录，不要再套一层 v10。
5. 根据所选版本确认替换范围：

   - **只解锁图鉴与回忆：**仅替换 `gameStategameDataV2`。它负责全局图鉴、回忆和成就，不替换 `gameState1` 等剧情进度文件及 `gameStateSaves` 槽位索引。
   - **使用强化开局：**复制完整包中的 `gameState1`、`gameState2`、`gameStateSaves` 和 `gameStategameDataV2`。此操作会替换第 1、2 槽及原有槽位索引；已有其他进度的玩家务必先备份。

6. 重新启动游戏，在额外内容中查看图鉴和回忆。安装强化开局包后，选择**第 2 槽**读取，并先确认剧情和后续教学能够正常推进。

---
{% tip success toc-heading %}
# 小兵求爱记 Love Esquire V1.6.6 存档下载
{% endtip %}
{% panDownload %}
quark: https://pan.quark.cn/s/4fb167448c2e
解压码: ziyanghua
{% endpanDownload %}

解压密码：ziyanghua

解压方法：<a href="/posts/1/">点击教程</a>
