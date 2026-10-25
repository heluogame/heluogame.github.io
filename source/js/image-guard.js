(function () {
  var guard = window.bbfttImageGuard;

  if (guard && typeof guard.refresh === "function") {
    guard.refresh();
    return;
  }

  var config = {
    selector: "#article-container img",
    message: "\u56fe\u7247\u5df2\u5f00\u542f\u4fdd\u62a4\uff0c\u6682\u4e0d\u652f\u6301\u53f3\u952e\u4fdd\u5b58",
  };

  function normalizePath(pathname) {
    return (pathname || "").replace(/\/+$/, "");
  }

  function hasCupPostTagLink() {
    var tagList = document.querySelector(".tag_share .post-meta__tag-list");
    if (!tagList) return false;

    return Array.prototype.some.call(tagList.querySelectorAll('a[href*="/tags/"]'), function (link) {
      var href = link.getAttribute("href") || "";
      try {
        href = decodeURIComponent(href);
      } catch (error) {
        // Keep the original href when it is already decoded.
      }

      return link.textContent.trim() === "\u98de\u673a\u676f" || href.indexOf("/tags/\u98de\u673a\u676f") !== -1;
    });
  }

  function isCupPost() {
    return /^\/posts\/gzfjb\d*$/.test(normalizePath(window.location.pathname)) || hasCupPostTagLink();
  }

  function getImageLink(img) {
    return img && img.closest ? img.closest("a[href]") : null;
  }

  function isAdImage(img) {
    if (isCupPost()) return true;

    var link = getImageLink(img);
    if (!link) return false;

    var href = link.getAttribute("href") || "";
    var path = "";
    try {
      path = normalizePath(new URL(href, window.location.href).pathname);
    } catch (error) {
      path = normalizePath(href.split("#")[0].split("?")[0]);
    }

    return /^\/posts\/gzfjb\d*$/.test(path) || (img.getAttribute("alt") || "").indexOf("\u8d5e\u52a9\u5e7f\u5b50") !== -1;
  }

  function isProtectedImage(target) {
    var img = target && target.closest ? target.closest(config.selector) : null;
    return img && !isAdImage(img);
  }

  function showTip() {
    if (window.btf && typeof window.btf.snackbarShow === "function" && window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.Snackbar) {
      window.btf.snackbarShow(config.message);
    }
  }

  function unwrapLightbox(img) {
    var link = img.parentNode;
    if (!link || link.tagName !== "A") return;
    if (!link.hasAttribute("data-fancybox")) return;

    link.removeAttribute("href");
    link.removeAttribute("data-fancybox");
    link.removeAttribute("data-caption");
    link.removeAttribute("data-thumb");
    link.style.cursor = "default";

    link.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );
  }

  function refresh() {
    document.querySelectorAll(config.selector).forEach(function (img) {
      if (isAdImage(img)) {
        img.classList.remove("no-lightbox");
        img.removeAttribute("draggable");
        img.style.webkitUserDrag = "";
        img.style.userDrag = "";
        img.style.webkitTouchCallout = "";
        img.style.webkitUserSelect = "";
        img.style.userSelect = "";
        img.style.cursor = "";

        var adLink = getImageLink(img);
        if (adLink) adLink.style.cursor = "";
        return;
      }

      img.classList.add("no-lightbox");
      img.setAttribute("draggable", "false");
      img.style.webkitUserDrag = "none";
      img.style.userDrag = "none";
      img.style.webkitTouchCallout = "none";
      img.style.webkitUserSelect = "none";
      img.style.userSelect = "none";
      img.style.cursor = "default";
      unwrapLightbox(img);
    });
  }

  document.addEventListener(
    "contextmenu",
    function (event) {
      if (!isProtectedImage(event.target)) return;
      event.preventDefault();
      showTip();
    },
    true
  );

  document.addEventListener(
    "dragstart",
    function (event) {
      if (!isProtectedImage(event.target)) return;
      event.preventDefault();
    },
    true
  );

  document.addEventListener(
    "click",
    function (event) {
      if (!isProtectedImage(event.target)) return;
      var link = event.target.closest("a[data-fancybox], a[href]");
      if (!link || !link.querySelector(config.selector)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  document.addEventListener("DOMContentLoaded", refresh);
  document.addEventListener("pjax:complete", refresh);

  window.bbfttImageGuard = {
    refresh: refresh,
  };

  refresh();
})();
