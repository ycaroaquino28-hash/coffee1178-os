import React from "react";

export default function Layout({ title, subtitle, online, children, nav }) {
  return <div className="app">
    <header className="topbar">
      <div><h1>{title}</h1><small>{subtitle}</small></div>
      <span className={`connection ${online ? "online" : "offline"}`}>
        {online ? "Online" : "Offline"}
      </span>
    </header>
    <main className="content">{children}</main>
    {nav}
  </div>;
}
