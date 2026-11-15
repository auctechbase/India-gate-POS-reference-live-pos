import React from "react";
// import "./loader.scss";
import { Spinner } from "reactstrap";

const Loader = () => (
  <div className="fallback-spinner">
    <div className="loading text-center place-item-center" style={{width:'100vw',height:'100vh',placeContent:'center'}}>
      <Spinner color="primary" />
    </div>
  </div>
);
export default Loader;
