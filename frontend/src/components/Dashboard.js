import React, { memo, useEffect } from 'react';
import {useDispatch, useSelector} from 'react-redux'
import inventory from '../asset/images/inventory.webp';
import store from '../asset/images/store.png';
import cart from '../asset/images/cart.webp';
import config from '../asset/images/config.png';
import sales from '../asset/images/sales.webp';
import {Link} from 'react-router-dom';
import { useGetSettingsQuery } from '../features/centerSlice';

function Dashboard() {
    const dispatch = useDispatch()
    const { theme } = useSelector( s => s.auth);
    const padding = {padding:'2%'};
    const card = {width:'100%',textAlign:'center', minHeight:170, placeContent:'center'}
    const {data, isSuccess } = useGetSettingsQuery();

    useEffect(()=>{
        if(isSuccess && data?.settings) {
            dispatch({type:"SETTINGS", payload: data.settings})
        }
    },[data, data?.settings, isSuccess]);

    return (
    <>
        <div className="container">
            <div className="d-grid" style={{placeItems:'center',height:'82vh'}}>
                <div className="d-flex w-100 " style={{justifySelf:'center', placeContent:'center'}}>
                    <div className="col-md-6">
                        <div className="row justify-content-center">
                            <div className="col-md-4 text-center" style={padding}>
                                <Link to={`/pos`} style={{textDecoration:'none'}}>
                                    <div className="card redirect" data-toggle="tooltip" data-placement="bottom" title="Point of sale">
                                    <div className="card-body">
                                        <div style={card}>
                                        {   
                                            theme==='retro' ? 
                                                <h1 style={{fontFamily:'system-ui'}}>POS</h1> : 
                                            <img src={store} className="w-100" alt=''/>
                                        }
                                        </div>
                                    </div>
                                    </div>
                                </Link>
                            { theme === 'default' && <h5 className="pt-3">Point of sale</h5> }
                            </div>
                            <div className="col-md-4 text-center" style={{...padding, width:theme==='retro' &&'66%'}}>
                                <Link to={`/inventory`} style={{textDecoration:'none'}}>
                                    <div className="card redirect" data-toggle="tooltip" data-placement="bottom" title="Inventory">
                                        <div className="card-body">
                                            <div className="d-flex">
                                                <div style={card}>
                                                    {
                                                        theme==='retro' ? 
                                                            <h1 style={{fontFamily:'system-ui'}}>INVENTORY</h1> : 
                                                        <img src={inventory} className="w-100" alt='' />
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                                { theme==='default' && <h5 className="pt-3">Inventory</h5> }
                            </div>
                            <div className="col-md-4 text-center" style={{...padding, width:theme==='retro' &&'33%'}}>
                                <Link to={`/products`} style={{textDecoration:'none'}}>
                                    <div className="card redirect" data-toggle="tooltip" data-placement="bottom" title="Products">
                                        <div className="card-body">
                                            <div className="d-flex">
                                                <div style={card}>
                                                    {
                                                        theme==='retro' ? 
                                                            <h1 style={{fontSize:'2.2rem',fontFamily:'system-ui'}}>PRODUCTS</h1> : 
                                                        <img src={cart} className="w-100" alt='' />
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                                { theme === 'default' && <h5 className="pt-3"> Products </h5> }
                            </div>
                            <div className="col-md-4 text-center" style={padding}>
                                <Link to={`/configuration`} style={{textDecoration:'none'}}>
                                <div className="card redirect" data-toggle="tooltip" data-placement="bottom" title="Configuration">
                                    <div className="card-body">
                                    <div className="d-flex">
                                        <div style={card}>
                                            {
                                                theme==='retro' ? 
                                                    <h1 style={{fontSize:'2.6rem',fontFamily:'system-ui'}}>CONFIG</h1> : 
                                                <img src={config} className="w-100" alt=''/>
                                            }
                                        </div>
                                    </div>
                                    </div>
                                </div>
                                </Link>
                                { theme==='default' && <h5 className="pt-3">Configuration</h5> }
                            </div>
                            <div className="col-md-4 text-center" style={padding}>
                                <Link to={`/sales`} style={{textDecoration:'none'}}>
                                <div className="card redirect" data-toggle="tooltip" data-placement="bottom" title="Sales">
                                    <div className="card-body">
                                    <div className="d-flex">
                                        <div style={card}>
                                            {
                                                theme==='retro' ? 
                                                    <h1 style={{fontSize:'2.6rem',fontFamily:'system-ui'}}>SALES</h1> : 
                                                <img src={sales} className="w-100" alt=''/>
                                            }
                                        </div>
                                    </div>
                                    </div>
                                </div>
                                </Link>
                                { theme==='default' && <h5 className="pt-3">Sales</h5> }
                            </div>
                        </div>
                    </div>
                    <div className="col-md-2 d-none">
                        <Link to={'/orders'} style={{textDecoration:'none'}}>
                            <div className="card redirect" style={{ height:"95%", marginTop:12, marginLeft:20 }}>
                                <div className="card-body">
                                    <h1 style={{fontFamily:'system-ui'}}>Orders</h1> <br/>
                                    <h1 style={{fontFamily:'system-ui'}}>From</h1> <br/>
                                    <h1 style={{fontFamily:'system-ui', fontSize:'2.4rem'}}>Website</h1>
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    </>
    )
}

export default memo(Dashboard)