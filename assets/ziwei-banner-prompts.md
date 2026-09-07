# Ziwei Banner 完整出图提示词

本文件记录当前保留的昼夜两张无框 Banner 的实际编辑提示词，包括所选黑夜母版的星体调整、白天派生及两版去框步骤。以下英文提示词按实际调用原文保存，没有用中文概述替代。

## 最终文件

| 版本 | 项目文件 | 生成输出 |
| --- | --- | --- |
| 白天 | [ziwei-banner-light.png](ziwei-banner-light.png) | `exec-6f6fc41e-2898-4479-b57c-b016d5ecf1be.png` |
| 黑夜 | [ziwei-banner-dark.png](ziwei-banner-dark.png) | `exec-a86d6201-f197-4f5c-8ef7-9409b65d04f6.png` |

## 生成方式与依赖

- 工具：内置 `image_gen`，通过 `prompt` 和 `referenced_image_paths` 编辑参考图片。
- 黑夜母版由用户明确指定：`exec-7f0f9ffa-f283-4550-9ef4-161cc19bcaa4.png`。
- 参考图与生成原件位于本机目录：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/`。
- 各步骤输入均为该次调用的编辑目标，使用一张参考图。模型、种子、采样参数和尺寸未通过独立参数指定。
- 这些是依赖参考图片的编辑提示词，并非不带参考图的从零生成指令。对应输入图片没有随本 Markdown 嵌入。
- 生成式编辑不是确定性的逐像素换色；两版可能存在细节差异。
- 中文字形为生成图中的宋体风格，未使用实际思源宋体字体文件进行排版。
- 日月位置沿用原图辰、戌的视觉位置；最终文件已去除宫格线。星象为装饰性表达，不对应真实命盘。

## 当前设计约束

左侧为 `Ziwei` 与 `紫微斗数排盘引擎`，右侧保留连续淡紫星河、中央柔光紫微星、左上侧珊瑚色太阳与右下侧黄色弯月。无十二宫外框和分隔线。白天使用白底深色文字，黑夜使用纯黑底白色文字。

## 1. 黑夜母版：中央星体调整

输入：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-fc7df8aa-9302-4d5f-8ab1-97871e277e57.png`

输出：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-7f0f9ffa-f283-4550-9ef4-161cc19bcaa4.png`

### 完整提示词

```text
Precise local edit of the supplied Ziwei banner. Replace ONLY the central eight-point spiky star. The user explicitly REJECTS radiating pointed rays. Completely erase its cross-shaped spikes and diagonal rays. Instead paint one small natural luminous stellar body with a tiny brilliant nucleus, a compact irregular softly feathered violet aura, and delicate layered mineral-pigment texture. No geometric outer boundary: color gathers close around the tiny nucleus and dissipates unevenly into the surrounding empty space. The shape is softly organic and nearly rounded but NOT a flat circular disk, filled dot, pearl or planet. No ray lines whatsoever, no starburst, cross, asterisk, sparkle icon, diamond, five-point star, lens flare, orbital ring or comet tail. Keep the whole luminous form modest, about 38 to 46 pixels across on this 1900px-wide banner, nucleus about 4px, not a large nebula or cloud. Use refined restrained gongbi color layering rather than glossy 3D effects. It should feel like a quietly glowing distant star.
Preserve exact layout, full banner framing, left title "Ziwei", Chinese serif subtitle "紫微斗数排盘引擎", existing text sizes and glyphs, all twelve-palace grid lines, entire perimeter celestial river and surrounding stars, coral sun in 辰 row2 col1, yellow crescent moon in 戌 row3 col4. Do not modify anything outside the central star's immediate area. No additional words or objects. Deliver ONE complete banner.
NIGHT VERSION: keep pure BLACK #000000 background and white text. Central star has a tiny silver-white nucleus and compact soft lavender luminosity, fading through violet to pure black with subtly irregular feathered edges. No light beams or strong bloom.
```

## 2. 从用户指定黑夜母版派生白天版

输入：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-7f0f9ffa-f283-4550-9ef4-161cc19bcaa4.png`

输出：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-e78d453b-7c6c-4a38-979b-d70c13df044c.png`

### 完整提示词

```text
Create a WHITE daytime colorway of this EXACT supplied black banner. This black image is the user-selected immutable visual master. Perform a color-only edit; do not redesign anything.
Replace pure black background with pure WHITE #FFFFFF, including all empty chart cells and central opening. Change the existing white title "Ziwei" and Chinese Song-serif subtitle "紫微斗数排盘引擎" into near-black, retaining exact glyph shapes, size, weight, baseline, placement and spacing. Adapt existing chart lines to medium-light neutral gray.
Preserve every foreground object's exact position, size, contour, structure and fine details, including the twelve-palace square grid, all twists and individual filaments of the peripheral celestial river, all individual stars, the coral sun in the left side upper chamber 辰 and yellow crescent moon in the right side lower chamber 戌. Sun stays coral and moon stays yellow, maintaining their painted textures.
CRITICAL CENTRAL BODY: reproduce the central purple luminous stellar body EXACTLY as in this black master, with the same irregular wispy organic outline, internal branching purple pigment texture, tiny clustered luminous nucleus, compact size and placement. Preserve all its existing details. On white ground, make the existing dark purple wisps visible as mid-purple and pale lilac, preserve the small luminous pale nucleus through surrounding violet contrast. Adapt the outer wisps to fade into white where they previously faded into black. Do NOT replace this body with a new circular orb, a flat disk, a spherical planet, a round purple flower, a geometric star icon, a cross or a starburst with long rays. No extra halo, no enlarged body. It must unmistakably be the same central painted stellar body of the supplied black image.
Likewise adapt the peripheral river's current purple filaments to delicate visible lavender on white, keeping its original contours and density. Preserve the original hierarchy and substantial white negative space. No added marks, removed stars, new curves, extra ornaments or text. Same canvas dimensions, framing and aspect ratio as the reference, no crop, no perspective changes. One full white-background banner, not side-by-side.
```

## 3. 白天版去掉十二宫框线

输入：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-e78d453b-7c6c-4a38-979b-d70c13df044c.png`

输出：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-6f6fc41e-2898-4479-b57c-b016d5ecf1be.png`

### 完整提示词

```text
Precise object removal edit. Remove ONLY ALL straight gray twelve-palace chart lines from the right half of this Ziwei banner: the entire outer square border, all interior horizontal and vertical partition lines, and the boundary of the central opening. Leave absolutely no rectangular frames, grid lines, line fragments or cell outlines. Naturally restore plain background where a line crossed empty space; reconnect the existing delicate river filaments wherever a grid line crossed them.
Preserve every OTHER element as faithfully as possible: exact full banner aspect ratio and framing, title "Ziwei" and Chinese Song-serif subtitle "紫微斗数排盘引擎", their glyphs, positioning and size; existing continuous winding roughly square-shaped purple celestial river, its exact shape and path, all stars; central small softly glowing irregular purple stellar body with the same texture and silhouette; coral sun at left upper-middle and yellow crescent moon at right lower-middle. Do not rearrange the river into a circle or galaxy, do not redesign the central stellar body, do not move the sun/moon or change their colors. This is only erasing the overlaid grid so the celestial painting floats freely with no frame. Preserve all original pigment tones, detail, scale and spacing. No new shapes, particles, borders, halos or text. One complete edited banner, not a crop.
Preserve the DAY palette: pure WHITE background #FFFFFF, black typography, pale lavender celestial river. Removed line areas should become pure white or continuous existing artwork.
```

## 4. 黑夜版去掉十二宫框线

输入：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-7f0f9ffa-f283-4550-9ef4-161cc19bcaa4.png`

输出：`/Users/lzm0x219/.codex/generated_images/01a07c6a-bf9e-7572-8bac-9a9c39b7e8bb/exec-a86d6201-f197-4f5c-8ef7-9409b65d04f6.png`

### 完整提示词

```text
Precise object removal edit. Remove ONLY ALL straight gray twelve-palace chart lines from the right half of this Ziwei banner: the entire outer square border, all interior horizontal and vertical partition lines, and the boundary of the central opening. Leave absolutely no rectangular frames, grid lines, line fragments or cell outlines. Naturally restore plain background where a line crossed empty space; reconnect the existing delicate river filaments wherever a grid line crossed them.
Preserve every OTHER element as faithfully as possible: exact full banner aspect ratio and framing, title "Ziwei" and Chinese Song-serif subtitle "紫微斗数排盘引擎", their glyphs, positioning and size; existing continuous winding roughly square-shaped purple celestial river, its exact shape and path, all stars; central small softly glowing irregular purple stellar body with the same texture and silhouette; coral sun at left upper-middle and yellow crescent moon at right lower-middle. Do not rearrange the river into a circle or galaxy, do not redesign the central stellar body, do not move the sun/moon or change their colors. This is only erasing the overlaid grid so the celestial painting floats freely with no frame. Preserve all original pigment tones, detail, scale and spacing. No new shapes, particles, borders, halos or text. One complete edited banner, not a crop.
Preserve the NIGHT palette: perfectly pure BLACK background #000000, white typography, lavender celestial river. Removed line areas should become pure black or continuous existing artwork.
```
