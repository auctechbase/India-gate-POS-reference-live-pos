import { memo, useEffect, useRef, useState } from 'react';
import TouchKeyboard from '../common/TouchKeyboard';
import axios from 'axios';
import { Link, useLocation, useNavigate, useParams} from 'react-router-dom';
import profile from "../../asset/images/profile.png";
import { useDispatch, useSelector } from 'react-redux';
import { useSearch } from '../../contexts/SearchContext';
import { Input, Modal, ModalBody, ModalFooter, ModalHeader, Form } from 'reactstrap';
import { f, Warning } from '../../helpers/utils';
import toast from 'react-hot-toast';
import { commonApiSlice, useGetNotificationsQuery } from '../../features/centerSlice';
import logo from '../../asset/images/logo.png';
import back from '../../asset/images/back.png'
import SearchBoard from '../pos/SearchBoard';
import { printDivById } from '../../helpers/attachments';
import { chosenStyle, focusedStyle } from '../../objects/styles';
const themes = {
    default: "/style.css",
    retro: "/css.css",
};

export const calTax = (percent,price) => percent && percent!=='null' ? (price * parseFloat(percent) / 100).toFixed(2) : 0.00;

export const Button = ({text, onClick}) => <button className={'btn btn-light btn-rounded foot-btn'} onClick={onClick}>{text}</button>

export const sanitize = tax => {
    if(tax === 'undefined' || tax === 'null' || tax === null || tax === undefined) {
        return '0';
    }
    if(!tax) return '0';
    return tax.replace(/\D/g, "");
}

export const TaxTable = ({taxes}) => {
    return (
        <table className='table w-100 tax-table-receipt' style={{width:'100%'}}>
            <thead className='tax-table'>
                <tr>
                    <th><span style={{fontSize:'1rem'}}> BTW </span></th>
                    <th><span style={{fontSize:'1rem'}}> OVER </span></th>
                    <th className='text-end'><span style={{fontSize:'1rem'}}> EUR </span></th>
                </tr>
            </thead>
            <tbody>
                {taxes.map((ord, ind) => <tr key={ind}>
                    <td>{ord.tax? ord.tax + '%': '0%'}</td>
                    <td>{ord.over? f(ord.over - ord.amount) :'0.00'}</td>
                    <td className={'text-end'}>€ {f(ord.amount)}</td>
                </tr>)}
            </tbody>
        </table>
    )
}

function Navbar() {
    const headers = {
        'Content-Type' : 'application/json',
        'pos-token': localStorage.getItem('pos-token')
    }
    const location = useLocation();
    const [filling, setFilling ] = useState(false);
    const params = useParams();
    const labelStyle = {fontSize:'0.8rem',padding:'0px 8px', borderRadius:12, background:'#ccbd67',color:'white', marginLeft:3}
    const { data } = useGetNotificationsQuery();
    const [ order, setOrder ] = useState({});
    const showQT = (products) => {
        let total=0
        products.forEach( k => {
            let {stock, price} = k
            if(price > 0) { // if price is negative then it was returning product (not to be considered in overall products)
                // if(Number(stock) < ((stock-0)+1)) { // agar koi product 0.2 ya 1 se km h to usko 1 maano bs
                //     stock = Math.ceil(stock)
                // }
                total+= Math.ceil(Number(stock))
            }
        })
        return total
    }
    const onChangeKey = input => setKey(input)
    const keyboardRef = useRef(null);




    const [full, setFull] = useState(true);
    const toggleScreen = e => {
        setFull(full => !full)
        if(window.electronAPI) {
            window.electronAPI.toggleFullscreen(full)
        }
    }

    const changeTheme = () => {
        let newTheme = theme==='default'? 'retro':'default'
        setTheme(newTheme)
        dispatch({ type:"THEME", payload: newTheme })
    }
    const handleTransaction = e => {
        let now = !sale
        localStorage.setItem('_is_sale', now)
        setType(now)
    }

    const removeNotification = e => {
        e.stopPropagation();
        e.preventDefault();
        const id = e.target.dataset.id
        axios.get(`config/notification/delete/${id}`).then(({data}) => {
            if(data.status) {
                dispatch(
                    commonApiSlice.util.updateQueryData('getNotifications', undefined, cache => {
                        cache['notifications'] = cache.notifications.filter( item => item.id !== parseInt(id) )
                    })
                )
            }
        })
    }
    const clearNotification = e => {
        e.stopPropagation();
        e.preventDefault();
        axios.get('config/clear-notifications', {
            headers
        }).then(({data}) => {
            if(data.status) {
                dispatch(
                    commonApiSlice.util.updateQueryData('getNotifications', undefined , cache => {
                        cache['notifications'] = [];
                    })
                )
            }
        })
    }
    const [notifications, setNotifications] = useState(data?.notifications??[])
    useEffect(()=> {
        setNotifications(data?.notifications??[])
    },[data])
    const modalBody = useRef(null);
    const { 
        setSearchQuery, 
        searchQuery, 
        sessions, 
        setSession, 
        activeSession, 
        setActiveSession, 
        displayImage, 
        handleImageDisplay, 
        sale, 
        setType, 
        setFocused, 
        focused,
        quick,
        setQuick
    } = useSearch();
    const printReceipt = async () => {
        const elem = modalBody.current;
        if(!elem) return toast.error(`Sorry can't go further...`);
        try {
            if(window.electronAPI) {
                window.electronAPI?.printContent({ html:elem.innerHTML, raw: { orderProducts, order } });
            } else {
                Warning("Printer not connected!")
                printDivById('receipt')
            }
        } catch (error) {
            console.error("Error capturing image:", error);
        }
    }
    const [appModal , setAppModal ] = useState(false);
    const notHome = location.pathname !== '/dashboard';
    const { cartProducts, split:splitStat, currency, appKey, inventory, categories, theme, hasKeyboard, allProds, openingCash, settings } = useSelector( state => state.auth );
    const [ keyboard, setKeyboard ] = useState(hasKeyboard); 
    const [themed, setTheme] = useState(theme);
    useEffect(() => {
        const themeLink = document.getElementById("switcher");
        if (themeLink) {
            themeLink.href = themes[themed];
        }
    }, [themed]);

    const handleKeyboard = () => {
        let chosen = !keyboard;
        setKeyboard(chosen)
        dispatch({ type: "KEYBOARD", payload: chosen })
        toast.success("Keyboard status updated!")
    }
    const switchProducts = () => {
        dispatch({ 
            type:"WITH_ALL_PRODUCTS", 
            payload:!allProds 
        })
        toast.success("Products status updated!")
    }
    const [ invent, setInvent ] = useState(inventory)
    const [ key,setKey] = useState(appKey)
    const [ orderModal, toggleOrderModal ] = useState(false);
    const [ total, setTotal ] = useState(0);
    const [ wasUpdate, setWasUpdate ]= useState(false)
    const [ orderProducts, setOrderProducts] = useState([]);

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const updateProducts = async e => {
        e.preventDefault()
        try {
            let tKey = key || appKey
            if(!tKey) {
                setFilling(true)
                return setAppModal(!appModal)
            }
            setKey(tKey)
            dispatch({ type: "SET_APP_KEY", payload: tKey })
            if(wasUpdate) {
                return uploadDB()
            }
            
            dispatch({ type:"LOADING" });

            toast.success("Importing...");
            const {data:resp} = await axios.get('products/sync/'+tKey, {
                headers: {
                    'Accept': 'application/json',
                    "Content-Type" : "multipart/form-data",
                    'pos-token' : localStorage.getItem('pos-token')
                }
            });
                if(resp.status) {
                    toast.success("Importing completed");
                    setTimeout(()=> window.location.reload(), 2400);
                }
        } catch (error) {
            if (error.code === "ERR_NETWORK") {
                toast.error("No internet connection!")
            } else {
                toast.error("Couldn't fetch products right now!")
            }
            setFilling(true)
            if(appModal) {
                setAppModal('true')
            } else {
                setAppModal(true)
            }
        }
        dispatch({ type:"STOP_LOADING" });
    }

    const split = () => {
        let btn = document.querySelector('.split-btn')
        dispatch({
            type: 'SPLIT',
            payload: btn.classList.contains('btn-outline-success')
        })
    }

    const [preset, setPreset] = useState('')
    useEffect(()=> {
        keyboardRef.current?.setInput(preset)
    },[preset])

    useEffect(()=> {
        setSearchQuery(searchQuery)
        return ()=> setSearchQuery('')
    },[searchQuery, setSearchQuery])
    
    const handleSession = () => {
        // just incrementing on basis of last element of `sessions` array 
        localStorage.setItem('cartSessions', JSON.stringify([...sessions, Number(sessions[sessions.length-1]) + 1]) );
        setSession([...sessions, Number(sessions[sessions.length-1]) + 1])
        window.electronAPI?.reloadWindow({manual:true})
    }

    const manageSession = id => {
        localStorage.setItem('_pos_current_session', id)
        setActiveSession(id);
        window.electronAPI?.reloadWindow({manual:true})
    }

    const uploadDB = () => {
        if(settings?.LAST_UPDATED) {
            const thatDay = new Date(settings.LAST_UPDATED);
            const today = new Date();

            const diffTime = Math.abs(today - thatDay);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if(diffDays > 1) { // upload db to server for backup
                if(!appKey && !key) {
                    console.log("upload kro database pahle 2")
                    setWasUpdate(true)
                    setFilling(true)
                    return setAppModal(!appModal)
                }
                const clientName = key
                axios.get('config/upload-db/'+ clientName).then(({data}) => {
                    dispatch({type:"SETTINGS", payload: data.settings });
                }).catch(()=>{})
            }
            return setAppModal(false);
        } else {
            
            if(!appKey && !key) {
                setWasUpdate(true)
                setFilling(true)
                return setAppModal(!appModal)
            }
            setFilling(false)
            setAppModal(false)
            const clientName = key || appKey
            axios.get('config/upload-db/'+ clientName).then(({data}) => {
                dispatch({ type:"SETTINGS", payload: data.settings })
            }).catch(()=>{})

        }
    }

    const forceUploadDB = () => {
        if(!appKey && !key) {
            setWasUpdate(true)
            setFilling(true)
            return setAppModal(!appModal)
        }
        setFilling(false)
        setAppModal(false)
        const clientName = key || appKey
        dispatch({type:"LOADING"})
        axios.get('config/upload-db/'+ clientName).then(({data}) => {
            dispatch({ type:"SETTINGS", payload: data.settings })
            dispatch({type:"STOP_LOADING"})
            toast.success("Backup uploaded!")
        }).catch(()=>{})
    }

    useEffect(() => {
        uploadDB()
    }, [])

    const logOut = async () => {
        dispatch({ type:"RESET_KART" });
        axios.get(`orders/day-close/${openingCash.id}`).then(({data})=>{
            if(data.status) {
                setSession([1]) // reset session
                dispatch({ type: "DAY_CLOSE" });
            }
        })
        dispatch({ type:"LOGOUT" })
    }

    const handleInventory = async () => {
        let now = !invent
        dispatch({type:"LOADING"})
        try {
            const {data} = await axios.get(`config/inventory/${now}`, {headers})
            if(data.status) {
                setInvent(now)
                dispatch({ type:'INVENTORY_IS', payload:now });
                toast.success(`Inventory is switched ${now? 'on':'off'}!`)
                dispatch({ type:"RESET_KART" })
            } else {
                toast.error(`Didn't worked!`)
            }
        } catch (er) {
            toast.error(`Didn't worked!`)
        }
        dispatch({ type:"STOP_LOADING" })
    }
    
    const search = e => setSearchQuery(e.target.value)
 
    const handleQuickProduct = e => {
        e.preventDefault();
        dispatch({
            type: "CHOOSEN_PRODUCT", 
            payload: {...cartProducts,[activeSession]: [...cartProducts[activeSession]??[], sale ? 
                { id:'quick', name:'Others', price:0.0, stock:1, other:true, weight:null } : 
                { id:'quick', name:'Others', price:0.0, stock:1, other:true, weight:null, return: true }
            ]}
        });
        window.electronAPI?.reloadWindow({...cartProducts,[activeSession]: [...cartProducts[activeSession]??[], 
            sale ? 
            { id:'quick', name:'Others', price:0.0, stock:1, other:true, weight:null } : 
            { id:'quick', name:'Others', price:0.0, stock:1, other:true, weight:null, return: true }
        ] })
        setTimeout(() => {
            let el = document.querySelector(`.chosen-product.other-product`);
            if(el) {
                el.scrollIntoView({
                    behavior:'smooth',
                    block: 'center'
                })
            }
        }, 10);
        setQuick(!quick)
    }

    const lastOrder = () => {
        dispatch({ type:`LOADING` });
        toggleOrderModal(!orderModal)
        axios.get(`orders/last-order`).then(({data})=> { 
            const {products, session, order} = data;
            const sessionData = JSON.parse(session.data);
            setTotal(data.order.amount);
            setOrder({...sessionData, ...order})
            let orderedProducts = Object.values(products).map( pr => ({...pr, stock:sessionData?.quantity[pr.id]}) );
            if((sessionData?.products??[]).indexOf('quick') !== -1) { // this is the place that contracts
                let overallExcept = orderedProducts.reduce( (pre,a) => pre + parseFloat((sessionData?.price[a.id] ?? a.price) * sessionData?.quantity[a.id]), 0);
                let otherPrice = data.order.amount - overallExcept;
                orderedProducts = [...orderedProducts, ...sessionData.products.filter( p=> orderedProducts.findIndex( o => o.id===p) === -1 ).map( p => (
                    {
                        id:p, 
                        name: typeof p ==='string' && p.indexOf('quick')!==-1? 'Others': p, 
                        price: sessionData.price[p]??otherPrice, 
                        stock: sessionData?.quantity[p]}
                )).flat()];
            }
            let cp =[];
            sessionData.products.forEach( pr => {
                cp.push(orderedProducts.find(p=>p.id===pr))
            })
            
            setOrderProducts(cp.map( p => {
                if(categories[p?.category_id]) {
                    p.isVeg= true
                }
                p.prices = sessionData.price ?? {}
                p.units = sessionData.unit??{}
                return p
            }));

            let xyz=[];
            cp.forEach(c => {
                let index = 0;
                let tax = sanitize(c.tax); 
                index = xyz.findIndex( p => sanitize(p.tax) === tax )
                // now take the overall price like qt * unit price its in c.prices[c.id]
                if( index !== -1 ) {
                    xyz[index]['amount'] = Number(xyz[index].amount) + Number(calTax(tax, c.prices[c.id]));
                    xyz[index]['over'] = Number(xyz[index].over) + Number(c.prices[c.id]);
                } else {
                    xyz.push({ tax, amount: calTax(tax, c.prices[c.id]), over: Number(c.prices[c.id]) });
                }
            })
            xyz = xyz.sort((a, b) => a.tax - b.tax);
            setTaxAmounts(xyz);

        }).catch()
        .finally( () => dispatch({ type:`STOP_LOADING` })) 
    }

    const proper = (stock, unit) => {
        if( typeof stock==='string' && unit && ([0,1].includes(stock.indexOf('.')) && (stock[0]==='0' || stock[0]==='.'))) {
            stock = stock * 1000
            if(unit && unit==='kg') {
                unit = stock > 1000 ? unit: 'gm'
            } else if(unit) {
                unit = stock > 1000 ? unit: 'mg'
            }
        }
        if(unit!=='gm') {
            stock = parseFloat(stock).toFixed(2)
        }
        return stock + (unit? ` ${unit}`: '')
    }

    useEffect(()=> {
        if(sessions && activeSession) {
            setActiveSession(activeSession);
        }
        return ()=> setActiveSession(sessions[0]);
    },[activeSession])

    const [taxes, setTaxAmounts] = useState([]);

    if(params && params.type==='customer') return null;
    
    return (
    <>
        <nav className="navbar default-layout col-lg-12 col-12 p-0 d-flex align-items-top flex-row no-print" style={{zIndex:999}}>
            { notHome && (<>
                <div className="text-center navbar-brand-wrapper d-flex align-items-center justify-content-start">
                    <div className="me-3">
                        <Link to={`/dashboard`} className="nav-link">
                            <i className="mdi mdi-home menu-icon fs-3" />
                        </Link>
                    </div>
                <div>
            </div>
        </div>
        </>)}
                
        <div className="navbar-menu-wrapper d-flex align-items-top" style={{width:!notHome?'100%':''}}>
            {notHome && (location.pathname.indexOf('/pos')===-1 ?
            <li className="navbar-nav nav-item">
                <button className="btn btn-sm mr-3" onClick={()=>navigate(-1)}>
                    <img src={back} style={{height:35,width:35}} alt=''/>
                </button>
            </li>
            : <button className={`btn btn-sm btn-${sale ?'success':'warning'}`} onClick={handleTransaction}>{sale?'Selling':'Returning'}</button>)}

            {['/pos','/pos/','/payment'].includes(location.pathname) && 
                (<>
                <li className="navbar-nav nav-item ms-3" onClick={handleSession} >
                    <div className="box"> + </div>
                </li>
                <ul className="navbar-nav ms-1 sessions">
                    { sessions.map( id => (<li className="nav-item fw-semibold ms-1" key={id} onClick={()=>manageSession(id)}>
                        <div className={`box ${activeSession===id? 'active':''}`}> {id} </div>
                    </li>)) }
                </ul>
                <button className="btn btn-outline-success btn-light btn-sm ms-2 quick-btn text-dark" type="button" onClick={handleQuickProduct} title="Quick add product to cart" >
                    Quick Add
                </button>
                <button className="btn btn-outline-success btn-light btn-sm ms-2 quick-btn text-dark" type="button" onClick={lastOrder} >
                    Last Receipt
                </button>
                <button className={`btn ${splitStat?'btn-success':'btn-outline-success'} btn-sm ms-2 split-btn text-dark`} type="button" onClick={split} title="Split products"> 
                    Split Products 
                </button>
                {
                    window.electronAPI ? 
                        <button className="btn btn-outline-success btn-light btn-sm ms-2 quick-btn text-dark" type="button" onClick={()=>{
                            window.electronAPI.drawCash()
                        }}>
                            Open drawer
                        </button>
                    :null
                }
                </>)
            }
            {location.pathname.includes("/payment/") && window.electronAPI &&
                <button className="btn btn-outline-success btn-light btn-sm ms-2 quick-btn text-dark" type="button" 
                onClick={()=> window.electronAPI.drawCash()}>
                    Open drawer
                </button>}
            {location.pathname === '/products' && (
                <Link to={'/product/create'} className={`btn-success btn btn-md btn-rounded`}> New </Link>
            )}

            <ul className="navbar-nav ms-auto">
                <li className="nav-item">
                    <Link to={'#'} className='nav-link' onClick={toggleScreen}>
                        <i className={`mdi mdi-fullscreen${full? '-exit':""}`} style={{fontSize:'2rem'}}/>
                    </Link>
                </li>
                <li className="nav-item d-flex align-items-center">
                    {theme==='default' && location.pathname==='/pos' && <button className='btn btn-rounded btn-sm btn-warning fs-4' onClick={()=>handleImageDisplay(!displayImage)}> 
                        {displayImage?'Hide':"Show"} Images
                    </button>}
                    <button className="btn" onClick={()=>window.location.reload()} title={'Refresh'}>
                        <i style={{fontSize:'2rem'}} className="mdi mdi-refresh" />
                    </button>
                </li>
                {location.pathname==='/pos' && (<>
                    <li className="nav-item" onClick={() => setFocused(!focused)}>
                        <form className="search-form" action="#">
                            <i className="fa fa-search" />
                            <input type="search" 
                                className="form-control" 
                                value={searchQuery} 
                                placeholder="Search Here" 
                                title="Search here" 
                                style={focused ? focusedStyle: {}} 
                                onInput={search} 
                            />
                        </form>
                    </li>
                </>)}

                <li className="nav-item dropdown">
                    <Link className="nav-link count-indicator" id="notificationDropdown" href="#" data-bs-toggle="dropdown">
                        <i className="mdi mdi-bell"/>
                        {notifications.length ? <span className="count"/>: null}
                    </Link>
                    <div className="dropdown-menu dropdown-menu-right navbar-dropdown preview-list pb-0" aria-labelledby="notificationDropdown" style={{ borderRadius:8 }}>
                        <Link className={`dropdown-item py-3 border-bottom`}>
                            <p className={`mb-0 fw-medium float-start`}> You have {notifications.length + (notifications.length > 1? ' notifications': ' notification')}  </p>
                            {notifications.length ? <span className={`badge badge-pill badge-primary float-end`} onClick={clearNotification}> Clear all </span>: null}
                        </Link>
                        {notifications.map( row => <Link className="dropdown-item preview-item py-2 position-relative" key={row.id} data-id={row.id}>
                            <div className="preview-thumbnail"><i className="mdi mdi-alert m-auto text-primary" /></div>
                            <div className="preview-item-content">
                                <h5 className="preview-subject fw-normal text-dark mb-1">{row.content}</h5>
                                <p className="fw-light small-text mb-0" />
                            </div>
                            <span onClick={removeNotification} data-id={row.id} className="fa fa-close align-items-center position-absolute align-self-center" style={{right:20}} />
                        </Link>)}
                    </div>
                </li>

                <li className="nav-item dropdown d-none d-lg-block user-dropdown">
                    <Link className="nav-link" id="UserDropdown" to={"#"} data-bs-toggle="dropdown" aria-expanded="false">
                        <img className={"img-xs rounded-circle"} src={profile} alt="" /> 
                    </Link>
                    <div className="dropdown-menu dropdown-menu-right navbar-dropdown" aria-labelledby="UserDropdown" style={{ borderRadius:8 }}>
                        <div className="dropdown-header text-center">
                            <img className={"img-md rounded-circle"} src={profile} alt={''} />
                            <p className="mb-1 mt-3 fw-bold"> {appKey ? `KEY: ${appKey}`: 'Key not specified'} </p>
                            <p className="fw-light text-muted d-none mb-0"> Admin </p>
                        </div>
                        <Link className="dropdown-item d-flex" style={{justifyContent:'space-between'}} to={"#"}>
                            <div> 
                                <i className="dropdown-item-icon mdi mdi-package-variant-closed-plus text-primary me-2"/> Inventory 
                            </div>
                            <div onClick={handleInventory}>
                                <input type={`checkbox`} style={{display:'none'}} id={`btn1999`}
                                checked={invent} onChange={()=>{}} className='status'/>
                                <label htmlFor={`btn1999`} />
                                <div className='plate'/>
                            </div> 
                        </Link>
                        <Link className="dropdown-item d-flex" style={{justifyContent:'space-between'}} to={"#"}>
                            <div>
                                <i className="dropdown-item-icon mdi mdi-keyboard text-primary me-2"/> Keyboard 
                            </div>
                            <div onClick={handleKeyboard}>
                                <input type={`checkbox`} style={{display:'none'}} id={`btn1991`}
                                checked={keyboard} onChange={()=>{}} className='status'/>
                                <label htmlFor={`btn1991`} />
                                <div className='plate'/>    
                            </div>
                        </Link>
                        <Link to={`#`} className="dropdown-item" onClick={changeTheme}>
                            <i className="dropdown-item-icon mdi mdi-brightness-6 text-primary me-2" /> 
                            Switch Theme
                        </Link>
                        <Link to={`#`} className="dropdown-item" >
                            <div> 
                                <i className="dropdown-item-icon mdi mdi-tray-full text-primary me-2"/>All Products
                            </div>
                            <div onClick={switchProducts}>
                                <input type={`checkbox`} style={{display:'none'}} id={`btn1931`}
                                checked={allProds} onChange={()=>{}} className='status'/>
                                <label htmlFor={`btn1931`} />
                                <div className='plate'/>    
                            </div>
                        </Link>
                        <Link className="dropdown-item" to={"#"} onClick={updateProducts}>
                            <i className="dropdown-item-icon mdi mdi-sync text-primary me-2" /> 
                            Sync Products
                        </Link>
                        {
                            window.electronAPI ?
                            <>
                                {/* "Update" removed: it downloaded the vendor's UI from pos.dftech.in over this
                                    build. The UI is now built from frontend/ (see frontend/README.md). */}
                                <Link className="dropdown-item" to={"#"} onClick={forceUploadDB}>
                                    <i className="dropdown-item-icon mdi mdi-backup-restore text-primary me-2" /> 
                                    Backup
                                </Link>
                            </>
                            : null
                        }
                        <Link className="dropdown-item" to={"#"} onClick={logOut}>
                            <i className="dropdown-item-icon mdi mdi-power text-primary me-2"/> 
                            Sign Out
                        </Link>
                        { window.electronAPI ?
                        <Link className="dropdown-item" to={"#"} onClick={()=> {
                            localStorage.removeItem("_last_location");
                            window.electronAPI?.closeApp()
                        }}>
                            <i className="dropdown-item-icon mdi mdi-close text-primary me-2"/> 
                            Quit
                        </Link>
                        : null }
                    </div>
                </li>
            </ul>
            <button className="navbar-toggler navbar-toggler-right d-lg-none align-self-center" type="button" data-bs-toggle="offcanvas" >
                <span className="mdi mdi-menu" />
            </button>
        </div>
        </nav>
        {location.pathname.indexOf('/pos')!==-1 && focused && <SearchBoard />}
        <Modal isOpen={orderModal}>
            <ModalHeader>
                <p style={{ fontSize:'1.5rem' }}> Previous Order Details </p>
            </ModalHeader>
            <ModalBody >
                <div className="col-lg-12" id="receipt" >
                    <div className="container" style={{backgroundColor:'white',paddingBottom:'10px',borderRadius:'15px',fontSize:'larger'}} >
                        <div className="row" style={{display:'flex',fontSize:'larger'}}>
                            <div className="d-grid" style={{justifyContent:'center',textAlign:'center',width:'100%',display:'grid'}}>
                                <img src={logo} alt='' style={{filter:"grayscale(1)"}} height={120} />
                            </div>
                        </div>
                        <div className="row" ref={modalBody}>
                            <div style={{width:'100%'}}>
                                <div style={{textAlign:'center',marginTop:10}}> 
                                    <h5 style={{textTransform:'uppercase'}}>
                                        <b style={{paddingTop:10}}>&#x260E;: 070-3563062</b><br/>
                                        <span>&#x1F6D2;</span>Hobbemaplein 50 <br/> 2526 JB Den Haag, Netherlands<br/>
                                    </h5>
                                </div>
                            </div>
                            <div className="receipt" style={{width:'100%',background:'#fff'}}>
                                {orderProducts.map( (order,i) => <div key={i} className='row' style={chosenStyle} >
                                        <div style={{ display:'flex',width:'100%',justifyContent:'space-between' }}>
                                            <div>
                                                <strong className='toShow' style={{fontSize:order.name.length > 35?'medium':'large',fontWeight:900,marginRight:6}}>
                                                    {order.isVeg? order.stock+' '+ order.units[order.id] :order.stock }x
                                                </strong>
                                                <b style={{ fontSize:order.name.length > 35?'medium':'large',fontWeight:900,maxWidth:'80%'}}>{order.name}</b>
                                                {order.prices[order.id] < 0 ? (<><small className='toHide' style={labelStyle}>-</small></>): null } 
                                            </div>
                                            <strong style={{whiteSpace:'nowrap'}}>
                                                { order.prices[order.id] > 0 ?  
                                                    currency +' '+ f(order.prices[order.id]): 
                                                    `- ${currency}`+ f(String(order.prices[order.id]).replace('-','')) }
                                            </strong>
                                        </div>
                                        <div className='toHide' style={{display:'flex',width:'100%',justifyContent:'space-between'}}>
                                            <p style={{fontSize:'large',fontWeight:900,marginTop:'.25rem'}}>
                                                { currency +' '+ parseFloat(Math.abs(order.prices[order.id] / order.stock)).toFixed(2) }
                                                { typeof order.id ==='string' && order.id.indexOf('quick') !== -1 ? ' x': ( order.units[order.id] ? `/ ${order.units[order.id]}` : '/ Units')}  
                                            </p>
                                            <p style={{fontSize:'medium',fontWeight:900,marginTop:'.25rem'}}>
                                                Qty: {order.isVeg? proper(JSON.stringify(order.stock), order.units[order.id]) :parseFloat(order.stock).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className='desc row' style={{lineHeight:1.1}}>
                                    <div style={{marginTop:10}}>
                                        {order.modes ? Object.keys(order.modes).map( (mode,i) => {
                                            if(order.modes[mode] && mode!=='Cash') {
                                                return <span key={i} style={{cssText:"font-size:1rem!important;font-weight:600;padding-right:15px"}}>
                                                    {(mode!=='ogCash'? mode:'Cash') +': '+ currency+' '+ f(order.modes[mode])}
                                                </span>
                                            }
                                            return null
                                        } ): order.payment_mode? (order.payment_mode)?.replace(',','+') +': '+currency+' ' + f(total):null}
                                    </div>
                                    <span style={{cssText:"font-size:1.75rem!important;font-weight:600;"}}>TOTAL &nbsp;{ currency+' '+parseFloat(total).toFixed(2) }</span>
                                    <br />
                                    <span style={{cssText:"font-size:1.25rem!important;font-weight:600;"}}>Products: {showQT(orderProducts)}</span>
                                    {order.r && (<><br/><span style={{cssText:"font-size:1rem!important;font-weight:600"}}>{order.r}</span></>)}
                                </div>
                                <div className="row">
                                    <TaxTable taxes={taxes}/>
                                </div>
                            </div>
                            <div style={{width:'100%',textAlign:'center'}}>
                                <small style={{paddingTop:3,fontSize:'1rem'}}>Thank you! Visit Again!</small>
                                <br />
                                <small style={{paddingTop:3,fontSize:'1rem'}}> {(new Date(order.created_at)).toLocaleString()}</small>
                            </div>
                        </div>
                    </div>
                </div>
            </ModalBody>
            <ModalFooter>
                <button className='btn btn-light btn-rounded' onClick={()=> toggleOrderModal(!orderModal)}> Close </button>
                <button className='btn btn-primary btn-rounded' onClick={printReceipt}>Print</button>
            </ModalFooter>
        </Modal>

        <Modal isOpen={appModal} size='sm' fade={false}>
            <Form onSubmit={updateProducts}>
                <ModalHeader>
                    Enter application key 
                </ModalHeader>
                <ModalBody>
                    <Input onChange={e=> setKey(e.target.value)} value={key} type='text' name='appKey' onClick={(e)=>{
                        setFilling(true)
                        setPreset(key)
                    }}/>
                </ModalBody>
                <ModalFooter>
                    <button 
                        className='btn btn-light btn-sm btn-rounded' 
                        type='button' 
                        onClick={()=> {setAppModal(false);setFilling(false)}}>Cancel</button>
                    <button className='btn btn-success btn-sm btn-rounded' > Submit </button>
                </ModalFooter>
            </Form>
        </Modal>
        {filling && !hasKeyboard && <TouchKeyboard
                open
                value={key}
                onChange={onChangeKey}
                label="Application key"
                onClose={() => setFilling(false)}
            />}

    </>
    )
}

export default memo(Navbar)