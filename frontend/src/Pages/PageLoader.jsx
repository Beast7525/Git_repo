import "./style/loading.css";
import pacman from "./assert/pacman.png";

function PageLoader() {
  return (
    <div className="loader">
      <div className="circles">
        <img className="pacman" src={pacman} alt="Profile" />
        <div className="oval"></div>
        <div className="oval"></div>
        <div className="oval"></div>
        <div className="oval"></div>
        <div className="oval"></div>
        <div className="oval"></div>
        <div className="oval"></div>
      </div>
    </div>
  );
}

export default PageLoader;