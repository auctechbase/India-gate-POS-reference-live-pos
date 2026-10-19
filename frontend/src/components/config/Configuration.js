import React, { memo, useEffect, useRef, useState } from 'react';
import TouchKeyboard from '../common/TouchKeyboard';
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
    
    
    
    const senty = {placeContent:'center'}
    // presetting text
    const [ presetTxt, setPreset ] = useState(minStock)
    useEffect(() => {
        keyboardRef.current?.setInput(presetTxt);
    }, [presetTxt]);

    // handling size 
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

        {focused && !hasKeyboard && <TouchKeyboard
                open
                value={minStock}
                onChange={setAlert}
                layout="integer"
                label="Stock alert"
                onClose={() => setFocused('')}
            />}
    </>
    )
}

export default memo(Configuration)