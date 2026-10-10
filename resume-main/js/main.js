"use strict";

// 使用相对路径；图片加载失败时仍会显示头像占位设计。
const PROFILE_IMAGE = "./assets/images/profile.jpg";
const THEME_KEY = "fanyajun-portfolio-theme";

const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeMeta = document.querySelector('meta[name="theme-color"]');

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private browsing may prevent storage; the current page still switches themes.
  }
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeToggle.setAttribute("aria-label", theme === "dark" ? "切换浅色模式" : "切换深色模式");
  themeToggle.title = theme === "dark" ? "切换浅色模式" : "切换深色模式";
  themeMeta?.setAttribute("content", theme === "dark" ? "#111218" : "#f7f7fa");
}

const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
applyTheme(readSavedTheme() || (systemPrefersDark ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  saveTheme(nextTheme);
});

const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");

function closeMenu() {
  navLinks.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "打开导航菜单");
}

menuToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "关闭导航菜单" : "打开导航菜单");
});

navLinks.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
document.addEventListener("click", (event) => {
  if (!navLinks.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
});
window.addEventListener("resize", () => {
  if (window.innerWidth > 850) closeMenu();
});

const profileImage = document.getElementById("profile-image");
const portraitPlaceholder = document.getElementById("portrait-placeholder");
if (PROFILE_IMAGE) {
  profileImage.addEventListener("load", () => {
    profileImage.hidden = false;
    portraitPlaceholder.hidden = true;
  });
  profileImage.addEventListener("error", () => {
    profileImage.hidden = true;
    portraitPlaceholder.hidden = false;
  });
  profileImage.src = PROFILE_IMAGE;
}

document.getElementById("current-year").textContent = String(new Date().getFullYear());

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
if ("IntersectionObserver" in window && !reducedMotion) {
  root.classList.add("js-ready");
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -35px 0px" });
  document.querySelectorAll(".reveal").forEach((section) => revealObserver.observe(section));
}

if ("IntersectionObserver" in window) {
  const links = [...navLinks.querySelectorAll('a[href^="#"]')];
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link) => {
        const active = link.getAttribute("href") === `#${entry.target.id}`;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-30% 0px -55% 0px" });
  document.querySelectorAll("main > section[id]").forEach((section) => sectionObserver.observe(section));
}
