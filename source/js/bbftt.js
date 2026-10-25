/*
 * @Description:
 * @Author: 安知鱼
 * @Date: 2023-02-24 14:30:29
 * @LastEditTime: 2025-10-25 22:09:58
 * @LastEditors: 安知鱼
 */
var bbftt = {
  // 监听按键
  toPage: function () {
    // 从 data 属性获取总页数
    var paginationEl = document.querySelector(".pagination");
    var totalPages = paginationEl ? Number(paginationEl.getAttribute("data-total-pages")) : 1;

    var a = document.getElementById("toPageText"),
      o = Number(a.value);

    // 获取当前页面的基础路径
    var currentPath = window.location.pathname;
    var basePath = "";
    var isHomePage = true;

    // 判断是否在首页（根路径或 /page/x/ 格式）
    // 如果路径不是 / 开头的 page，说明是在其他页面（如 tags、categories 等）
    if (currentPath !== "/" && !currentPath.match(/^\/page\/\d+\/?$/)) {
      isHomePage = false;
      // 提取基础路径，去掉 /page/数字/ 部分
      basePath = currentPath.replace(/\/page\/\d+\/?$/, "").replace(/\/$/, "");
    }

    if ("" != o && !isNaN(o) && o % 1 == 0) {
      if (1 == o) {
        // 第一页
        if (isHomePage) {
          document.getElementById("toPageButton").href = "/";
        } else {
          document.getElementById("toPageButton").href = basePath + "/";
        }
      } else if (o > totalPages) {
        // 超出最大页数，跳转到最后一页
        if (isHomePage) {
          document.getElementById("toPageButton").href = "/page/" + totalPages + "/";
        } else {
          document.getElementById("toPageButton").href = basePath + "/page/" + totalPages + "/";
        }
      } else {
        // 跳转到指定页数
        if (isHomePage) {
          document.getElementById("toPageButton").href = "/page/" + o + "/";
        } else {
          document.getElementById("toPageButton").href = basePath + "/page/" + o + "/";
        }
      }
    }
  },
};

//监听跳转页面输入框是否按下回车
function listenToPageInputPress() {
  var input = document.getElementById("toPageText");
  if (input) {
    input.addEventListener("keydown", event => {
      if (event.keyCode === 13) {
        // 如果按下的是回车键，则执行特定的函数
        bbftt.toPage();
        var link = document.getElementById("toPageButton");
        var href = link.href;
        pjax.loadUrl(href);
      }
    });
  }
}

listenToPageInputPress();
