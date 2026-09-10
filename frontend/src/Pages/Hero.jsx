import { useNavigate } from "react-router-dom";
import "./Hero.css";
import Login from "./Login";
function Hero() {
  const navigate = useNavigate();
  return (
    <section className="hero">

      <h1>
        Build, Manage & Collaborate
        <br />
        On Your Code Repositories
      </h1>

     
      <div className="hero-buttons">
        <button className="primary-btn" onClick={() => navigate("/Login")}>
          Get Started
        </button>

        <button className="secondary-btn">
          Learn More
        </button>
      </div>

    </section>
  );
}

export default Hero;