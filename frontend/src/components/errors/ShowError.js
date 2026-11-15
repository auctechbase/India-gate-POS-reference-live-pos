import React, { useEffect } from 'react'
import $ from 'jquery';

const ShowError = ({error='Unexpected Error'}) => {
    
    useEffect(()=>{

        setTimeout(function(){
            $('div.loading').removeClass('loading');
        }, 0);

    },[])

  return (
    <div className="loading"> 
        <h1>500</h1>
        <h2>{error} &nbsp;<b> {':('} </b> </h2>
        <div className="gears">
            <div className="gear one">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            </div>
            <div className="gear two">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            </div>
            <div className="gear three">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            </div>
        </div>
    </div>
  )
}

export default ShowError