import "./style/loading.css";
import pacman from "./assert/pacman.png";

function PageLoader() {
  return (
    <div className="loader">
      <div className="circle-container">
        {/* Pac-Man Orbiting Layer */}
        <div className="pacman-orbit">
          <img className="pacman" src={pacman} alt="Pac-Man Loader" />
        </div>

        {/* Circular Dots */}
        <div className="dots-circle">
          <div className="oval dot-1"></div>
          <div className="oval dot-2"></div>
          <div className="oval dot-3"></div>
          <div className="oval dot-4"></div>
          <div className="oval dot-5"></div>
          <div className="oval dot-6"></div>
          <div className="oval dot-7"></div>
          <div className="oval dot-8"></div>
        </div>
      </div>
    </div>
  );
}

export default PageLoader;