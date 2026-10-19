import React, { memo, useEffect, useRef, useState } from 'react';
import Keyboard from 'react-simple-keyboard';
import axios from 'axios';
import toast from 'react-hot-toast';
import category from '../../asset/images/category.png';
import tax from '../../asset/images/tax.png';
import notes from '../../asset/images/notes.webp';
import alert from '../../asset/images/alert.png';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { Modal, ModalHeader, ModalFooter, ModalBody, FormGroup, Form } from 'reactstrap';

function Configuration() {
    const keyboardRef = useRef();
    const { currency, stockAlert, theme, hasKeyboard } = useSelector(state => state.auth);
    const [ currencyCatogory, setCurrencyCategory ] = useState(false);
    const [ stockModal, setStockModal ] = useState(false);
    const [ minStock, setAlert ] = useState(stockAlert)
    const [ focused, setFocused ] = useState(false)
    const dispatch = useDispatch();
    const updateCurrency = () => {
        axios.get("https://api.apilayer.com/exchangerates_data/latest?symbols=EUR&base=INR", {
            redirect: 'follow',
            headers: {
                apikey : "vs3K0OZhqMCEvsgiDYTEj97mfSHKCxn7"
            }
        }).then(({data}) => console.log(data))
        .then(result => console.log(result))
        .catch(error => console.log('error', error))
    }
    
    const updateStockAlert = e => {
        e.preventDefault();
        axios.post('config/update-stock-alert', {stock: minStock}).then(({data}) => {
            if(data.status) {
                setFocused(null)
                toast.success(data.message);                 
                dispatch({ type: "STOCK_ALERT", payload: minStock })
            } else {
                toast.error(data.message);
            }
        }).catch(()=>toast.error("Something went wrong!"))
    }
    
    useEffect(()=>{});
    
    const [ position, setPosition ] = useState({ x: window.screen.availWidth/4, y: window.screen.availHeight / 2 });
    const [ dragging, setDragging ] = useState(false);
    const [ offset, setOffset ] = useState({ x: 0, y: 0 });
    
    const handleMouseDown = (e) => {
        setDragging(true);
        setOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    };
    
    const handleMouseMove = (e) => {
        if (!dragging) return;
        setPosition({
            x: e.clientX - offset.x,
            y: e.clientY - offset.y,
        });
    }
    const handleMouseUp = () => setDragging(false);
    const senty = {placeContent:'center'}
    // presetting text
    const [ scale, setScale ] = useState(localStorage.getItem('_keyboard_scale')??1)
    const [ presetTxt, setPreset ] = useState(minStock)
    useEffect(() => {
        keyboardRef.current?.setInput(presetTxt);
    }, [presetTxt]);

    // handling size 
    const decrease = () => {
        localStorage.setItem('_keyboard_scale', Math.max(scale - 0.1, 0.5))
        setScale(prev => Math.max(prev - 0.1, 0.5))
    }
    const increase = () => {
        localStorage.setItem('_keyboard_scale', Math.min(JSON.parse(scale) + 0.1, 2))
        setScale(prev => Math.min(prev + 0.1, 2))
    }
    return (
    <>
        <div className="content-wrapper">
            <div className="d-grid mt-3" style={{placeItems: 'center'}}>

                <div className="d-flex" style={{gap:'20px',marginTop:'10%',marginLeft:'-20%'}}>
                    <div className="text-center col-4">
                        <Link className="card redirect tablink showCat" to={`/config/categories`} title={"Categories"}>
                            <div className="card-body">
                                {theme==='default' ? 
                                <div className="d-flex" title={"Categories"} style={senty}>
                                    <div style={{width:'70px', textAlign:'center'}}>
                                        <img src={category} height="80" alt=''/> 
                                    </div>
                                </div>
                                : <h1 style={{fontSize:'3rem'}}>Category</h1>}
                            </div>
                        </Link>
                        {theme==='default' && <h5 className="pt-3 fs-2">Category</h5>}
                    </div>
                    <div className="text-center col-4">
                        <Link className="card redirect tablink" to={`/config/taxes`} title={"Taxes"}>
                            <div className="card-body">
                                {theme==='default' ? 
                                <div className="d-flex" title={"Taxes"} style={senty}>
                                    <div style={{width:'70px', textAlign:'center'}} >
                                        <img src={tax} height="80" alt={''}/> 
                                    </div>
                                </div>
                                : <h1>Tax</h1>}
                            </div>
                        </Link>
                        {theme==='default' && <h5 className="pt-3 fs-2"> Tax </h5>}
                    </div>
                   
                    <div className="text-center col-4">
                        <div className="card redirect tablink" onClick={()=> setStockModal(!stockModal)} title={"Set stock alert"}>
                            <div className="card-body">
                            {theme==='default' ?
                                <div className="d-flex" title={"Set stock alert"} style={senty}>
                                    <div style={{width:'70px', textAlign:'center'}} >
                                        <img src={alert} height="80" alt='' /> 
                                    </div>
                                </div>
                            : <h1 style={{fontSize:'2.5rem'}}>Stock Alert</h1>}
                            </div>
                        </div>
                        {theme==='default' && <h5 className="pt-3 fs-2"> Stock Alert </h5>}
                    </div>
                    
                    <div className="text-center col-4">
                        <Link className="card redirect tablink" to={`/notes`} title="Add payment notes">
                            <div className="card-body">
                                {theme==='default' ? 
                                <div className="d-flex" title="Add payment notes" style={senty}>
                                    <div style={{width:'70px', textAlign:'center'}} >
                                        <img src={notes} height="80" alt=''/> 
                                    </div>
                                </div>
                                : <h1>Notes</h1>}
                            </div>
                        </Link>
                        {theme==='default' && <h5 className="pt-3 fs-2"> Add Notes </h5>}
                    </div>
                </div>
            </div>

        </div>

        <Modal isOpen={currencyCatogory} >
            <ModalHeader >
                Currency
            </ModalHeader>
            <ModalBody>
                <div className="form-group">
                    <select name="currency" id="currency" className="form-control" onChange={updateCurrency}>
                        <option value="euro" {...currency === '€ ' ? 'selected':''} > Euro </option>
                        <option value="inr" {...currency === '₹ ' ? 'selected':''} > INR </option>
                    </select>
                </div>
            </ModalBody>
            <ModalFooter>
                <button className='btn btn-light btn-rounded' onClick={()=> setCurrencyCategory(!currencyCatogory)}>Close</button>
            </ModalFooter>
        </Modal>

        <Modal isOpen={stockModal}>
            <Form onSubmit={updateStockAlert}>
                <ModalHeader>
                    Set stock alert
                </ModalHeader>
                <ModalBody>
                    <FormGroup>
                        <small><b> Select minimun stock to get notified </b></small>
                        <input type="text" pattern="\d*" className="form-control" placeholder="e.g 50, 100" onClick={()=> {
                            setPreset(JSON.stringify(minStock))
                            setFocused('alert');
                        }} onChange={ e => setAlert(e.target.value)} value={minStock} />
                    </FormGroup>
                </ModalBody>
                <ModalFooter>
                    <button className='btn btn-light btn-rounded' type='button' onClick={()=> {
                        setStockModal(!stockModal)
                        setFocused('')
                    }}>Close</button>
                    <button className='btn btn-success btn-rounded' > Update </button>
                </ModalFooter>
            </Form>
        </Modal>

        {
            focused && !hasKeyboard && <div className='mt-4 position-fixed w-50' style={{zIndex:9999, top:60 }}>
            <div
                style={{
                    overflow: "hidden",
                    position: "relative",
                    touchAction: "none",
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
                        transform:`scale(${scale})`, 
                        transformOrigin: "top center",
                        touchAction: "none",
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
                            onChange={(e)=>setAlert(e)}
                            keyboardRef={(r) => (keyboardRef.current = r)}
                            layout={{
                                default: [
                                    "1 2 3",
                                    "4 5 6",
                                    "7 8 9",
                                    "0 . {bksp}",
                                ]
                            }}
                            display={{ 
                                "{bksp}":"x", 
                            }}
                        />
                    <div className='bg-white d-flex board-navs' style={{justifyContent:'space-between',padding:'5px 20px'}}>
                        <button className='btn btn-light btn-rounded' onClick={()=>{
                            setAlert('')
                            keyboardRef.current.clearInput()
                        }} style={{border:'1px solid gray'}}> CLEAR </button>
                        <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={decrease}>-</button>
                        <span> Size: {Math.round(scale * 100)}% </span>
                        <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={increase}>+</button>
                        <button onClick={()=>setFocused('')} className='btn btn-light btn-rounded' style={{border:'1px solid gray'}}>HIDE</button>
                    </div>
                </div>
            </div>
        </div>
        }
    </>
    )
}

export default memo(Configuration)