import React, { useEffect, useRef, useState } from 'react';
import Keyboard from "react-simple-keyboard";
import CreatableSelect from 'react-select/creatable'
import { useDispatch, useSelector } from 'react-redux';
import {Link, useNavigate} from 'react-router-dom';
import toast from 'react-hot-toast'
import product from '../../asset/images/default.png';
import GIF from '../../asset/images/progress.gif';
import xlsImg from '../../asset/images/xls.png';
import axios from 'axios';
import { Warning } from '../../helpers/utils';
import { commonApiSlice, useGetPosProductsQuery, useGetProductCategoriesQuery, useGetProductsQuery } from '../../features/centerSlice';
import { Button } from '../layouts/Navbar';
import { innerStyle } from '../../objects/keyboard/keyboardStyle';

function CreateProduct() {
    const { currency, hasKeyboard }= useSelector(state => state.auth);
    const [ placeholder, setPlaceholder ] = useState(product)
    const [ categories , setCategories] = useState([])
    const { refetch } = useGetPosProductsQuery();
    const { refetch: refetchOrg} = useGetProductsQuery()
    const { refetch: refetchCat } = useGetProductCategoriesQuery()
    const [ taxes , setTaxes] = useState([])
    const [ focused, setFocused ] = useState(false);
    const [ layoutName, setLayout ] = useState('default');
    const input = {borderRadius: 25};
    const dispatch = useDispatch();
    const [xls, noteFile] = useState(null);
    const navigate = useNavigate();
    const [fields, setFields] = useState({name:'',price:'',category_id:'',barcode:'',tax:'',image:null})

    const keyboardRef = useRef(null);

    const handleFile = e => {
        var reader= new FileReader();
        reader.readAsDataURL(e.target.files[0])
        reader.onload = function() {
            setPlaceholder(reader.result)
        }
        setFields({...fields, image: e.target.files[0]??null })
    }

    const importXl = e => {

        e.preventDefault();

        let fd = new FormData();
        if(!xls) return toast.error('Fill the required fields!')

        fd.append('file', xls);
        dispatch({type:"LOADING"});

        axios.post(`/products/import`, fd, {
            headers:{ 
                "Accept"       :"application/json",
                "Content-Type" : "multipart/form-data",
                "pos-token": localStorage.getItem('pos-token')
            }
        }).then(({data}) => {
            if(data.status) {
                refetch()
                refetchOrg()
                refetchCat()
                navigate('/products');
                return toast.success(data.message);
            }
            return toast.error(data.message);
        }).catch(()=> toast.error("Failed to import excel.Re-check the format and try again!"))
        .finally(()=> dispatch({type:"STOP_LOADING"}));

    }

    const change = e => setFields({...fields, [e.target.name]: e.target.value })

    const addProduct = async e => {
        e.preventDefault();
        if(!fields.name || !fields.price) {
            return Warning("Fill the required fields")
        }
        if(!fields.barcode && !fields.category_id) {
            return Warning("Product barcode is required!")
        }
        if(fields.category_id && !fields.barcode) {
            let cat = categories.find(ite => ite.id === parseInt(fields.category_id))
            if( (cat.name.toLowerCase().indexOf('veg')=== -1 ) && (cat.name.toLowerCase().indexOf('fruit')===-1)) {
                return Warning("Barcode is required!")
            }
        }
        setFocused('')
        let fd = new FormData();
        for (const field in fields) {
            fd.append(field, fields[field])
        }
        dispatch({type:"LOADING"})

        try {
            const {data} = await axios.post(`/products/create`, fd, {
                headers:{ 
                    "Accept"       :"application/json",
                    "Content-Type" : "multipart/form-data",
                    "pos-token"    : localStorage.getItem('pos-token')
                }
            })
            if(data.status) {
                toast.success(data.message)
                dispatch(
                    commonApiSlice.util.updateQueryData('getPosProducts', undefined, cache => {
                        if(cache['products']){
                            cache['products'].unshift(data.product)
                        }
                    })
                )
                dispatch(
                    commonApiSlice.util.updateQueryData('getProducts', undefined, cache => {
                        if(cache['products']){
                            cache['products'].unshift(data.product)
                        }
                    })
                )
                dispatch({type:"STOP_LOADING"})
                navigate('/products')
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)    
        }
        dispatch({type:"STOP_LOADING"})
    }

    const getCategories = ()=> {
        axios.get('category').then(({data}) => {
            if(data.status){ 
                setCategories(data.categories)
            }
        })
    }
    const getTaxes = ()=> {
        axios.get('tax').then(({data}) => {
            if(data.status){ 
                setTaxes(data.taxes)
            }
        })
    }

    useEffect(()=> { 
        getCategories();
        getTaxes();
        return ()=> null
    },[])

    function putFile(e){
        e.preventDefault();
        noteFile(e.target.files[0])
    }
    const [position, setPosition] = useState({ x: window.screen.availWidth / 3, y: window.screen.availHeight / 3 })
    const [dragging, setDragging] = useState(false)
    const [offset, setOffset] = useState({ x: 0, y: 0 })

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

    const onChange =  e => {
        setFields({...fields, [focused]:e})
    }
    
    const [presetTxt, setPreset] = useState('');
    useEffect(() => {
        keyboardRef.current?.setInput(presetTxt);
    }, [presetTxt, focused]);
    
    const [scale, setScale] = useState(localStorage.getItem('_keyboard_scale')??1); // Default scale (1 = 100%)

    const decrease = () => {
        localStorage.setItem('_keyboard_scale', Math.max(scale - 0.1, 0.5))
        setScale(prev => Math.max(prev - 0.1, 0.5))
    }
    const increase = () => {
        localStorage.setItem('_keyboard_scale', Math.min(JSON.parse(scale) + 0.1, 2))
        setScale(prev => Math.min(JSON.parse(prev) + 0.1, 2))
    }
    const [barcode, setBarcode] = useState('');

    useEffect(() => {

        let lastKeyTime = Date.now();
        let inputBuffer = "";
        const handleKeyDown = (event) => {
            const { key } = event;
            const currentTime = Date.now();
            const timeDiff = currentTime - lastKeyTime;
            if (timeDiff < 50) {
                if (key === "Enter") {
                    setBarcode(inputBuffer);inputBuffer=""; 
                } else {
                    if (key.length === 1) {
                        inputBuffer += key;
                    }
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [barcode]);
    return (
        <>
        <div className="content-wrapper">
            <div className="row">
                <div className="col-md-12 grid-margin stretch-card">
                    <div className="card">
                        <div className="card-header d-flex" style={{justifyContent:'space-between'}}>
                            <h4 className="mt-2">Create Product</h4>
                            <Link
                                download={"Format_Products_Import_POS.xls"}
                                to={'http://localhost:5100/images/Format_Products_Import_POS.xlsx'}
                                className="btn btn-sm btn-warning btn-rounded"
                                style={{border:"1px solid"}}
                            >
                                Download Sample Excel
                            </Link>
                        </div>
                        <div className="card-body">
                            <div className="row" id="hider">
                                <div className="col-6">
                                    <form onSubmit={addProduct} >
                                        <div className="card-body">
                                            <div className="row" style={{width:'100%'}} >
                                                <div className="col-10">
                                                    <div className="form-group">
                                                        <label htmlFor="product_name" className="fs-5"> Product </label> <br/>
                                                        <textarea name="name" 
                                                            onChange={change} 
                                                            onClick={(e)=>{
                                                                setFocused('name')
                                                                setPreset(fields.name)
                                                            }}
                                                            id="product_name" 
                                                            className="form-control" 
                                                            value={fields.name} 
                                                            style={input} 
                                                            placeholder="e.g. Butter"  
                                                        />
                                                    </div>
                                                </div>
                                                <div className="col-2">
                                                    <div className="form-group">
                                                        <label htmlFor="product_image" >
                                                            <img src={placeholder} alt="" className="label-img"/>
                                                        </label>
                                                        <input name="image" id="product_image" onChange={handleFile} accept="image/*" type="file" className="d-none" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="row">

                                                <div className="col-8 d-flex" style={{flexDirection:'column', gap:'30px',width:'100%',justifyContent:'start'}}>
                                                    <div className="row w-100">
                                                        <div className="col-4">
                                                            Category
                                                        </div>
                                                        <div className="col-8">
                                                            <select name="category_id" onChange={change} className="form-control d-none" style={input}>
                                                                <option value=""> Choose </option>
                                                                {categories.map( opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                                                            </select>
                                                            <CreatableSelect
                                                                onFocus={()=> setFocused('')}
                                                                options={categories.map(opt => ({...opt, value: opt.id, label: opt.name }))}
                                                                onChange={ e => setFields({...fields, category_id: e.value})}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="row w-100">
                                                        <div className="col-4">
                                                            Sales Taxes
                                                        </div>
                                                        <div className="col-8">
                                                            <CreatableSelect 
                                                                name='tax'
                                                                onFocus={()=> setFocused('')}
                                                                onChange={e =>{setFields({...fields, tax: e.value })}}
                                                                options={taxes.map( t => ({...t, value: t.name +' '+t.amount, label: t.name+' '+t.amount}))}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="row w-100">
                                                        <div className="col-4 align-self-center">
                                                            Price
                                                        </div>
                                                        <div className="col-8">
                                                            <input 
                                                                pattern="^\d+(\.\d+)?$" 
                                                                onChange={change} 
                                                                title="Price should be number" 
                                                                name="price"
                                                                className="form-control" 
                                                                placeholder={currency} 
                                                                style={input} 
                                                                onClick={(e)=>{
                                                                    setFocused('price')
                                                                    setPreset(fields.price)
                                                                }} 
                                                                value={fields.price}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="row w-100">
                                                        <div className="col-4 align-self-center">
                                                            Barcode
                                                        </div>
                                                        <div className="col-8">
                                                            <input 
                                                                name="barcode" 
                                                                onChange={change} 
                                                                placeholder='Barcode here..' 
                                                                style={input} 
                                                                className="form-control" 
                                                                onClick={(e)=>{
                                                                    setPreset(fields.barcode)
                                                                    setFocused('barcode')
                                                                }} 
                                                                value={fields.barcode}
                                                            />
                                                        </div>
                                                    </div>

                                                </div>

                                            </div>
                                        </div>
                                        <div className="row mt-2 ms-4">
                                            <button className="w-100 btn btn-rounded btn-success fs-2"> Add Product </button>
                                        </div>
                                    </form>

                                </div>
                                <div className="col-2 align-self-center position-relative" style={{height:'74vh',placeContent:'center'}}>
                                    <div className="l"></div>
                                    <div className="circle">
                                        <h1>OR</h1>
                                    </div>
                                </div>
                                <div className="col-4 d-grid" style={{placeContent:'center'}}>
                                    <form id="importForm" onSubmit={importXl} style={{display:'grid'}}>
                                        <div className="form-group d-flex" style={{border:'1px solid gray',borderRadius:10,width:300,position:'relative'}}>
                                            <label htmlFor="importFile" style={{width:'100%',height:'100%'}}>
                                                <img className="xlsImg" src={xlsImg} alt=""/>
                                                <img className="spinner d-none" src={GIF} alt="spinner"/>
                                            </label> 
                                            <input type="file" name="file" id="importFile" className="d-none" accept=".csv, .xls, .xlsx" onChange={putFile}/> 
                                        </div> 
                                        <button type="submit" className="btn btn-primary btn-rounded uploadBtn" disabled={!xls}> Import Excel </button>
                                    </form>
                                </div>

                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
        { focused && !hasKeyboard && <div className='mt-4 position-fixed w-50 v-keyboard' style={{zIndex:9999, top:60 }}>
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
                        width: focused==='price'? 400: 700,
                        touchAction: "none",
                        transform: `scale(${scale})`, transformOrigin: "top center"
                    }}
                >
                    <div
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleMouseDown}
                        style={innerStyle}
                    >
                        <Button text={<i className='fa fa-minus'/>} onClick={decrease} />
                        <span> Hold To Drag </span>
                        <Button text={<i className='fa fa-plus'/>} onClick={increase} />
                    </div>
                        <Keyboard
                            onChange={onChange}
                            onKeyPress={(e) => {
                                if(e === "{lock}")
                                {
                                    setLayout((prev) => (prev === "default" ? "shift" : "default"))
                                }
                            }}
                            keyboardRef={(r) => (keyboardRef.current = r)}
                            layout={{
                                default: focused==='price' ? [
                                    "1 2 3",
                                    "4 5 6", 
                                    "7 8 9",
                                    "0 . {bksp}"
                                ]: [
                                    "1 2 3 4 5 6 7 8 9 0",
                                    "q w e r t y u i o p",
                                    "{lock} a s d f g h j k l",
                                    "z x c v b n m {bksp}",
                                    "{space}"
                                ],
                                shift: [
                                    "1 2 3 4 5 6 7 8 9 0",
                                    "Q W E R T Y U I O P",
                                    "{lock} A S D F G H J K L",
                                    "Z X C V B N M {bksp}",
                                    "{space}"
                                ]
                            }}
                            display={{
                                "{lock}":"Caps",
                                "{bksp}": focused==='price'? 'x': "Backspace",
                                "{space}":" "
                            }}
                            layoutName={layoutName}
                        />
                    <div className='bg-white d-flex board-navs' style={{justifyContent:'space-between',padding:'5px 20px'}}>
                        <Button onClick={()=>{
                            setFields({...fields,[focused]:''})
                            keyboardRef.current.clearInput()
                        }} text={'CLEAR'} />
                        <button onClick={()=>setFocused('')} className='btn btn-light btn-rounded' style={{border:'1px solid gray'}}>HIDE</button>
                    </div>
                </div>
            </div>
        </div>
        }
        </>
    );
}

export default CreateProduct