import React, { useRef, useState } from 'react';
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { useSearch } from '../../contexts/SearchContext';
import { useSelector } from 'react-redux';

export default function SearchBoard() {

    const {setSearchQuery, focused, setFocused} = useSearch();
    const {hasKeyboard} = useSelector(s => s.auth)
    const [position, setPosition] = useState({ x: window.screen.availWidth/3.5, y: window.screen.availHeight / 2.82 });
    const [dragging, setDragging] = useState(false);
    const [offset, setOffset] = useState({  x: 0, y: 0  });
    const onChange = input => setSearchQuery(input)
    const keyboardRef = useRef(null);
 
    const handleMouseDown = (e) => {
        const clientX = e.touches?.[0]?.clientX || e.clientX;
        const clientY = e.touches?.[0]?.clientY || e.clientY;
        setDragging(true);
        setOffset({
            x: clientX - position.x,
            y: clientY - position.y,
        });
    };

    const handleMouseMove = (e) => {
        if (!dragging) return;

        const clientX = e.touches?.[0]?.clientX || e.clientX;
        const clientY = e.touches?.[0]?.clientY || e.clientY;

        setPosition({
            x: clientX - offset.x,
            y: clientY - offset.y,
        });
    };

    const handleMouseUp = () => setDragging(false);
    // handling size 
    const [scale, setScale] = useState(localStorage.getItem('_keyboard_scale')??1); // Default scale (1 = 100%)

    const decrease = () => {
        localStorage.setItem('_keyboard_scale', Math.max(scale - 0.1, 0.5))
        setScale(prev => Math.max(prev - 0.1, 0.5))
    }
    const increase = () => {
        localStorage.setItem('_keyboard_scale', Math.min(JSON.parse(scale) + 0.1, 2))
        setScale(prev => Math.min(JSON.parse(prev) + 0.1, 2))
    }
    if(hasKeyboard) return null

    return (
        <div className='mt-4 position-fixed w-50 v-keyboard' style={{zIndex:9999, top:60 }}>
            <div
                style={{
                    overflow: "hidden",
                    touchAction: "none",
                    position: "relative",
                }}
                onMouseMove={handleMouseMove}
                onTouchMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchEnd={handleMouseUp}
            >
                <div
                    style={{
                        position: "fixed",
                        top: `${position.y}px`,
                        left: `${position.x}px`,
                        cursor: dragging ? "grabbing" : "grab",
                        zIndex: 1000,
                        width:700,
                        resize:'both',
                        overflow:'auto',
                        touchAction: "none",
                        transform: `scale(${scale})`, transformOrigin: "top center"
                    }}
                >
                    <div
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                        style={{
                            background: "#444",
                            color: "#fff",
                            padding: 10,
                            cursor: "grab",
                            textAlign: "center",
                            borderRadius: "8px 8px 0 0",
                            touchAction: "none",
                        }}
                    >
                        Hold To Drag 
                    </div>
                        <Keyboard
                            onChange={onChange}
                            keyboardRef={(r) => (keyboardRef.current = r)}
                            layout={{
                                default: [
                                "1 2 3 4 5 6 7 8 9 0",
                                "q w e r t y u i o p",
                                "a s d f g h j k l",
                                "z x c v b n m {bksp}",
                                "{space}"
                            ]}}
                        />
                    <div className='bg-white d-flex board-navs w-100' style={{justifyContent:'space-between',padding:'5px 20px'}}>
                        <button className='btn btn-light btn-rounded' 
                            onClick={()=>{setSearchQuery('');keyboardRef.current.clearInput()}} 
                            style={{border:'1px solid gray'}}>CLEAR</button>
                        <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={decrease}>-</button>
                        <span style={{placeContent:'center'}}> {Math.round(scale * 100)}% </span>
                        <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={increase}>+</button>
                        <button onClick={()=>setFocused(!focused)} className='btn btn-light btn-rounded' style={{border:'1px solid gray'}}>HIDE</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
