# 凡亚军 · Portfolio / Resume

**个人网站：** [https://danielkater.github.io/resume/](https://danielkater.github.io/resume/)

一个使用 HTML5、CSS3 和原生 JavaScript 编写的个人介绍网站。网站展示个人照片、教育背景与真实奖项，并为项目和联系方式预留位置。当前版本可直接在本地打开；未来也可以部署到 GitHub Pages。

## 技术栈

- HTML5
- CSS3
- 原生 JavaScript
- 无依赖、无构建步骤

## 项目目录

```text
resume/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   ├── images/
│   │   ├── .gitkeep
│   │   └── profile.jpg
│   └── icons/
│       └── site-mark.svg
├── README.md
└── .gitignore
```

## 本地运行

直接双击 `index.html`，或在 VS Code 中用 Live Server 打开。网站不需要安装 npm 包。Light / Dark Mode 会保存在浏览器的 `localStorage` 中。

## 修改个人信息

在 `index.html` 中搜索 `TODO`，逐项补充 GitHub 地址、邮箱、技术方向等尚未提供的信息。姓名、学校、专业和奖项已经根据现有资料填写。没有真实地址之前，GitHub 和邮箱入口保持禁用，避免跳转到错误页面。

## 替换个人照片

当前照片保存在 `assets/images/profile.jpg`。以后要更换时，用同名图片覆盖即可；如果文件名或格式不同，请同步修改 `js/main.js` 中的 `PROFILE_IMAGE` 相对路径。图片加载失败时会显示设计好的占位区域，不会显示破图图标。

## 新增项目

在 `index.html` 的 Projects 区域找到 `project-card-template`。复制其中的 `<article>` 到 `#project-list` 内，填写项目名称、介绍、技术栈、GitHub Repository、Demo 和截图路径。新增真实项目后，删除或隐藏 `#projects-empty`。截图也请放在 `assets/images/` 中并使用相对路径。

## 新增奖项

在 `index.html` 的 Awards 区域复制现有的 `.award-card`，再填写真实的奖项名称和等级。没有确定的信息不要补写年份、赛区或组别。
