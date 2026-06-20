(function () {
  const nav = document.querySelector(".sidebar .sb-nav");
  const brandText = document.querySelector(".sidebar .sb-brand-text");

  if (!nav || !brandText) return;
  if (window.location.pathname.includes("/service")) return;
  if (brandText.textContent.trim().toUpperCase() !== "BRATVA") return;

  const style = document.createElement("style");
  style.textContent = `
.sb-link-admin {
  margin-top: auto;
  position: relative;
}
.sb-link-admin::before {
  content: "";
  position: absolute;
  left: 18px;
  right: 18px;
  top: -6px;
  height: 1px;
  background: var(--border);
}
`;
  document.head.appendChild(style);

  const existingAdminLink = nav.querySelector("#adminLink");
  const wasAdminVisible = !!existingAdminLink && existingAdminLink.style.display !== "none";
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";

  const items = [
    { href: "/dashboard", label: "Home", icon: "&#127968;" },
    { href: "/bratva-panel", label: "Bratva", icon: "&#128081;" },
    { href: "/sputnik-panel", label: "Sputnik", icon: "&#9889;" },
    { href: "/task", label: "Task", icon: "&#128203;" },
    { href: "/calculator", label: "Calculator", icon: "&#128176;" },
    { href: "/invoiri-panel", label: "&#206;nvoiri", icon: "&#128197;" },
    { href: "/amenzi", label: "Amenzi", icon: "&#9888;&#65039;" },
    { href: "/locatii", label: "Loca&#539;ii", icon: "&#128205;" },
    { href: "/hack", label: "Hack", icon: "&#128187;" },
    { href: "/admin", label: "Admin", icon: "&#128737;" }
  ];

  nav.innerHTML = items.map((item) => {
    const isActive = currentPath === item.href;
    const isAdmin = item.href === "/admin";
    const className = [
      "sb-link",
      isActive ? "active" : "",
      isAdmin ? "sb-link-admin" : ""
    ].filter(Boolean).join(" ");
    const attrs = [
      isAdmin ? 'id="adminLink"' : "",
      isAdmin && !wasAdminVisible ? 'style="display:none"' : "",
      isActive ? 'aria-current="page"' : ""
    ].filter(Boolean).join(" ");

    return `<a href="${item.href}" class="${className}" ${attrs}>
      <span class="sb-icon">${item.icon}</span>
      <span class="sb-label">${item.label}</span>
    </a>`;
  }).join("");
})();
