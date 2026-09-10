import React from "react";
import "./Header.css";
import logo from "../assets/logo.png";
import login from "./Login";
function Header() {
  return (
    <header className="header">

      <div className="logo">
        <img src={logo} alt="Git Repo Logo" />
        <h1>Git Repo</h1>
      </div>

      <nav>
        <ul className="nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/Features">Features</a></li>
          <li><a href="/login">Sign Up</a></li>
        </ul>
      </nav>
      

    </header>
  );
}

export default Header;