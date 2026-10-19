import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux'
import { commonApiSlice } from '../../features/centerSlice';
import pos from '../../asset/images/logo.png'
import { f, Warning } from '../../helpers/utils';
import axios from 'axios';
import toast, { LoaderIcon } from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { useSearch } from '../../contexts/SearchContext';
import { TaxTable } from '../layouts/Navbar';

let RETURNS=0
export default function Payment() 
{
    const headers = {
        'Content-Type' : 'application/json',
        'pos-token': localStorage.getItem('pos-token')
    }
    const targetDiv = useRef(null);
        const calTax = (percent, price) => percent && percent!=='null'? (price * parseFloat(percent) / 100).toFixed(2) : 0.00;

    const sanitize = tax => {
        if(tax === 'undefined' || tax === 'null' || tax === null || tax === undefined) {
            return '0';
        }
        if(!tax) return '0';
        return tax.replace(/\D/g, "");
    }

    const showTaxes = arr => {
        let xyz=[];
        arr.forEach(c=> {
            let index=0
            let tax = sanitize(c.tax);
            index = xyz.findIndex( p => sanitize(p.tax) === tax);
            // now take the overall price like qt * unit price its in c.prices[c.id]
            if( index !== -1 ) {
                xyz[index]['amount'] = Number(xyz[index].amount) + Number(calTax(tax, c.stock * c.price));
                xyz[index]['over'] = Number(xyz[index].over) + Number(c.price * c.stock);
            } else {
                xyz.push({ tax, amount: calTax(tax, c.stock * c.price), over: c.price * c.stock });
            }
        });
        xyz = xyz.sort((a,b) => a.tax-b.tax)
        return xyz;
    }
    
    const chosenStyle = {
        marginTop:'.5rem',
        alignItems: 'center',
        borderRadius: 10,
        border:"2px dashed",
        minHeight: '20px',
        backgroundColor: '#fff',
        position: 'relative'
    }
    const [ processing, setProcess ] = useState(0)
    const navigate = useNavigate();
    const {active} = useParams();
    const [receiptOn, setReceipt] = useState(JSON.parse(localStorage.getItem('prt_receipt')??'false'));
    const { setSession, sessions, setActiveSession, sale, setType } = useSearch();
    const [ byAll, setByAll ] = useState({Cash:0, Card:0, Account:0});
    const dispatch = useDispatch();
    const mode = { width:'96%', cursor:'pointer' }
    const labelStyle = {fontSize:'0.8rem',padding:'0px 8px', borderRadius:12, background:'#ccbd67',color:'white', marginLeft:3}

    const { currency, cartProducts, openingCash, cartStocks, categories } = useSelector(state => state.auth );
    const [ paymentMethod, setPaymentMethod ] = useState([]);
    const [ paidAmount, setPaid ] = useState(byAll.Cash + byAll.Card + byAll.Account);
    const [ KartProducts, setKartProducts] = useState([]);
    const [ currentMethod, setCurrentMethod ] = useState('');
    const [ number, setNumber ] = useState('');

    const showQT = (products) => {
        let total = 0
        if(products.length===0) return 
        products.forEach( k => {
            if(!k.return) {
                let {stock} = k
                // if(Number(stock) < 1) {
                //     stock = Math.ceil(stock)
                // }
                total+= Math.ceil(Number(stock))
            }
        })
        return total
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

    const choosePaymentMethod = (method, note=false) => {
        if( note ) {
            let previous = byAll.Cash;
            previous = parseFloat(previous);
            if(total < 0) {
                setByAll({...byAll, Cash: ( previous - parseInt(note) ) });
            } else {
                setByAll({...byAll, Cash: ( previous + parseInt(note) ) });
            }
        } else {
            let fillAmt = total - paid();
            if( fillAmt <= total ){
                setByAll(() => ({ ...byAll, [method]: fillAmt.toFixed(2) }));
            }
            setPaid(() => (byAll.Cash+ byAll.Card + byAll.Account))
        }
        if( !paymentMethod.includes(method) ) {
            setPaymentMethod([ ...paymentMethod, method ]);
        }
        setCurrentMethod(method);
        setNumber('');
    }

    const changeInput = input => {
        let newAmount
        newAmount = number + input;  
        setNumber(number + input);
        setByAll({...byAll, [currentMethod]:newAmount});
    }

    const showTotal = () => {
        let additions=0;
        let returns=0;
        if(cartProducts[active]?.length || KartProducts[active]?.length) {
            if(cartProducts[active]?.length) {
                additions = cartProducts[active].filter( _ => _.return === undefined)
                returns = cartProducts[active].filter( _ => _.return === true)
            } else {
                additions = KartProducts[active].filter( _ => _.return === undefined)
                returns = KartProducts[active].filter( _ => _.return === true)
            }
            additions = additions.reduce((acc, cur)=> acc + (cur.stock * parseFloat(cur.price)),0)
            returns = returns.reduce((acc, cur)=> acc + (cur.stock * parseFloat(cur.price)),0)
        }
        RETURNS = returns
        return parseFloat(additions - returns)
    }

    const total = showTotal()
    const returnPart = () => {
        let htm = '';
        if(total < paid()) {
            if(total > 0) {
               htm+= `Return ${currency}${Math.abs((total - paid()).toFixed(2))}`
            } else {
                if(total > 0 && paid() > total) {
                    htm += `Put back ${total.toFixed(2) - paid()}`;
                } else {
                    htm += `Return ${currency + Math.abs(total.toFixed(2) - paid())}`
                }
            }
        } else {
            if(parseFloat(total).toFixed(2) > 0) {
                htm += `Remaining `; 
            } else {
                htm += `Put back `;
            }
            htm += parseFloat(Math.abs(total - paid())).toFixed(2)
        }
        return htm
    }
    
    const takeSnipAndPrint = async (products,order) => {
        const elem = targetDiv.current;
        try {
            if(window.electronAPI){
                window.electronAPI.printContent({ html:elem.innerHTML, raw : { orderProducts:products, order }});
            } else {
                Warning("Printer not connected!")
            }
        } catch (error) {
            console.error("Error capturing image:", error);
        }
    }

    const initPayment = async () => {
        let quicks = 1;
        if( processing ) return;
        if(total===0) return navigate('/pos')
        let paidAmount = parseFloat(byAll.Cash) + parseFloat(byAll.Card) + parseFloat(byAll.Account)
        if(total > 0 && paidAmount < total.toFixed(2)) { // paid-amount agr total se kam hai to laut jao
            return Warning("Pay the remaining amount!");
        }
        if(total < 0) { // total - me hai yani return ho rhe products
            if(f(paidAmount) > f(total)) { // aur ab agr paid-amount total se jyada hai(- k terms me) -2 > -5
                return Warning("Return the remaining amount!")
            }
        }
        setProcess(true);
        let cashForDrawer = total.toFixed(2); // cash in drawer = total
        let reducible = parseFloat(byAll.Card)

        if(reducible > 0 && reducible > total.toFixed(2)) {
            reducible = reducible - total.toFixed(2)
            cashForDrawer -= reducible
        }
        
        let thruAC = parseFloat(byAll.Account);
        if(thruAC > 0 && thruAC > total.toFixed(2)) {
            thruAC = thruAC - total.toFixed(2)
            cashForDrawer -= thruAC;
        }
        const sessionData = cartProducts[active].reduce(
            (acc, { stock, id, price, unit, ...rest }) => {
                if(acc.products.indexOf(id) ===-1 || id==='quick') { // quick hi ayega udhr se hmesa so its all done here
                    if(acc.products.indexOf(id) !== -1) { // add with incremented number
                        quicks+=1
                        acc.products.push(id+quicks)
                    } else {
                        acc.products.push(id)
                    }
                }
                if(id==='quick' && acc.quantity[id]) {
                    acc.quantity[`${id+quicks}`] = stock // ++ stock of this round
                } else {
                    acc.quantity[id] = id!=='quick' ? ((acc.quantity[stock] || 0) - 0) + (stock-0) : stock-0;  // Increment quantity
                }
                acc.total = f(total); // Accumulate total price
                if(unit) acc.unit[id] = unit?? null
                if(id==='quick' && acc.price[id]) {
                    acc.price[id+quicks] = rest.return ? - (acc.quantity[id+quicks] || 0) * f(price) : (acc.quantity[id+quicks] || 0) * f(price)
                } else {
                    acc.price[id] = rest.return ? - (acc.quantity[id] || 0) * f(price) : (acc.quantity[id] || 0) * f(price)
                }
                if(id==='quick') acc.otherAmount = rest.return ? (acc.otherAmount -0) - price: (acc.otherAmount -0) + (price-0)
                acc.r = returnPart();
                return acc;
            },
            { products: [], total: 0, quantity: {}, otherAmount:0.00, unit:{}, price:{}, r:'' }
        );

        const {data} = await axios.post(`orders/create`, {
            session_id: active,
            customer_id:'',
            cash_register_id: openingCash.id,
            cashForDrawer,
            amount: total,
            payment_mode: paymentMethod.toString(),
            transaction_type:sale? 'credit':'debit', // debit in case of money & credit in case of stocks
            modes: {...byAll, Cash: cashForDrawer, ogCash:byAll.Cash },
            returns: RETURNS,
            sessionData 
        }, 
            {headers}
        );

        if(data.status) {
            toast.success(sale? "Order completed!": "Return completed!");
            if(!sale) {
                localStorage.setItem('_is_sale', 'true');
                setType(true)
            }

            if(receiptOn ) {
                setKartProducts(cartProducts[active]);
                const replica = JSON.parse(JSON.stringify(cartProducts[active]));
                await takeSnipAndPrint(replica.map( p => {
                    if(categories[p?.category_id]) {
                        p.isVeg= true;
                    }
                    p.prices = sessionData.price ?? {};
                    p.units = sessionData.unit??{};
                    return p;
                }), data.order);
            } else {
                window?.electronAPI?.drawCash()
            }

            localStorage.removeItem('_pos_current_session')
            window.electronAPI?.reloadWindow({manual:true})
            // set it up in a way if previous active session has some products then prevents its vanishing
            if(sessions.length===1) {
                localStorage.setItem('cartSessions', JSON.stringify(sessions.map( item => item + 1)));
                dispatch({ type: "CHOOSEN_PRODUCT" , payload: []});
                setSession(sessions.map( i => i+1 ));
                setActiveSession(sessions.map( i => i+1 )[sessions.length-1]);
            } else {
                /*
                    if its last of sessions then remove it & add +1 inplace
                    if its mid-one or the first then simply remove it (incrementing will add +1 to last yet existing session)
                */
                let updatedSession
                if(Number(active) === sessions[sessions.length-1]) { // its the last one
                    updatedSession = sessions.map( ite => ite === Number(active)? Number(active)+1: ite)
                }
                
                // its the mid-one, just make it disappear
                if(![sessions[sessions.length-1]].includes(Number(active))) {
                    updatedSession = sessions.filter( e => e !== Number(active))
                }
                localStorage.setItem('cartSessions', JSON.stringify(updatedSession))
                setSession(updatedSession);

                let updatedState = {...cartProducts};
                delete updatedState[active]
                setActiveSession(updatedSession[updatedSession.length-1])
                dispatch({ type: "CHOOSEN_PRODUCT" , payload: updatedState});
            }
            dispatch(
                commonApiSlice.util.updateQueryData(`getPosProducts`, undefined, cache => {
                    cache['products'] = cache.products.map( product => {
                        if(cartStocks.hasOwnProperty(product.id)) {
                            product.quantity = sale ? product.quantity - cartStocks[product.id]: product.quantity + cartStocks[product.id]
                        } 
                        return product;
                    })
                }),
            )
            if(data.notifications.length) {
                dispatch(
                    commonApiSlice.util.updateQueryData('getNotifications', undefined, cache => {
                        data.notifications.forEach( notify => { 
                            cache['notifications'].push(notify);
                        });
                    })
                )
            }
            dispatch({ type: "STOP_LOADING" });
            
            
            let alertHTML = returnPart()
            toast((<div style={{
                width:450,
                background:"#fff",
                borderRadius:'10px',
                position:'absolute',
                boxShadow:'0px 18px 40px 0px lightyellow',
                right:10}}>
                    <h2 style={{padding:'10px 30px',fontSize:"2.7rem",whiteSpace:'nowrap',fontWeight:900}}>{alertHTML}</h2>
                </div>), {
                duration:8000,
                position:"top-right"
            })
            navigate(`/pos`);
        } else {
            toast.error("Failed to create the order!");
        }
        setProcess(false);

    }

    const toggleReceipt = mode => {
        localStorage.setItem('prt_receipt', mode)
        setReceipt(mode);
    }

    const paid = () => Object.values(byAll).reduce((p,c)=> p+parseFloat(c),0)

    return (
        <div className="content-wrapper">
            <div className="col-lg-12 grid-margin stretch-card" style={{justifyContent:'space-around'}}>
                <div className="col-lg-5">
                    <div className="row" style={{height:'15rem'}}>
                        <div className="container">
                            {[ 'Cash', 'Card', 'Account' ].map( (met,_) => <div className="row mt-2" key={met}>
                                <div className={`card ms-2 payment-${met.toLowerCase()} ${currentMethod===met && 'active'}`} style={mode} onClick={()=> choosePaymentMethod(met)}>
                                    <div className="card-body">
                                        <div className="d-flex" style={{alignItems:'center',gap:'5px',color:'#1e283d'}}>
                                            { _ === 0 && <i className="mdi mdi-cash" aria-hidden={true} />}
                                            { _ === 1 && <i className="fa fa-credit-card" aria-hidden={true} />}
                                            { _ === 2 && <i className="fa fa-user" aria-hidden={true} />} 
                                            <strong> <p className="m-0"> {met} </p>  </strong>
                                        </div>
                                    </div>
                                </div>
                            </div>)}
                        </div>
                    </div>
                    {<div className="row">
                        <div className="col-sm-12 d-flex">
                            <button 
                                type="button" 
                                className="btn bg-white text-dark w-100 mt-3 justify-content-center" 
                                style={{width:'50%',alignContent:'center',color:'white',fontSize:'1.4rem',border:'1px solid'}} 
                                onClick={()=>toggleReceipt(!receiptOn)} 
                            > 
                                Receipt 
                                <input
                                    type='checkbox' 
                                    checked={receiptOn} 
                                    style={{marginLeft:25, height:20,width:25}} 
                                    onChange={()=>{}} 
                                /> 
                            </button>
                        </div>
                    </div>}
                    { paymentMethod.length ? (<>
                        <div className="calculator">
                            <div className="row mt-2 offset-2">
                                {[1,2,3].map( (btn,i) => <div className="col-sm-3" key={i} onClick={()=>changeInput(btn)}>
                                    <button style={{fontSize:'1.5rem'}} className="btn btn-light  w-100 text-dark"> <b> {btn} </b> </button>
                                </div> )}
                            </div>
                            <div className="row mt-1 offset-2">
                                {[4,5,6].map( (btn,i) => <div className="col-sm-3" key={i} onClick={()=>changeInput(btn)}>
                                    <button style={{fontSize:'1.5rem'}} className="btn btn-light  w-100 text-dark"> <b> {btn} </b> </button>
                                </div> )}
                            </div>
                            <div className="row mt-1 offset-2">
                                {[7,8,9].map( (btn,i) => <div className="col-sm-3" key={i} onClick={()=>changeInput(btn)}>
                                    <button style={{fontSize:'1.5rem'}} className="btn btn-light  w-100 text-dark"> <b> {btn} </b> </button>
                                </div> )}
                            </div>
                            <div className="row mt-1 offset-2">
                                {[0, '.'].map( it => <div key={it} className={`col-sm-3 `} onClick={()=> changeInput(it)}>
                                    <button style={{fontSize:'1.5rem'}} className="btn btn-light w-100 text-dark"> <b> {it} </b> </button>
                                </div> )}
                                <div className="col-sm-3" onClick={()=> {
                                    setByAll({...byAll, [currentMethod]:0});
                                    setNumber('')
                                }}>
                                    <button style={{fontSize:'1.5rem'}} className="btn btn-light w-100 text-dark"> <b> Clear </b> </button>
                                </div>
                            </div>
                            <div className="row mt-1">
                                <div className="col-sm-12 d-flex">
                                    <button type={`button`} className={`w-100 btn btn-light text-white validate`} 
                                        style={{width:'47%',backgroundColor: '#0d172c',opacity:1,textTransform:'uppercase'}} 
                                        onClick={initPayment}
                                    >
                                    { processing ? <div className='d-grid' style={{placeItems:'center'}}>
                                        <LoaderIcon style={{ width:20, height:20 }}/>
                                    </div> :'Complete Payment' }
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>)
                    : null }
                </div>
                <div className="final col-lg-6">
                    <div className="card">
                        <div className="card-body">
                            <h1 className="text-success" style={{textAlign:'center'}}>
                                <span className="total-amount">{currency + parseFloat(total).toFixed(2)}</span>
                            </h1>
                        </div>
                    </div>
                    <div className="card mt-3 w-100 parent">
                        <div className="row selections">
                            <strong className={`${paymentMethod.length && 'd-none'}`}>
                                <span className="info"> Please select a payment method </span>
                            </strong>
                            {paymentMethod.length ? ( // if any mode is selected start to display
                                <>
                                    { total < paid() || total === paidAmount ? (
                                        <div className={`card ${paid() > total ?'fulfilled':'remaining' }`} >
                                            <div className="card-body exception">
                                                <div className="d-flex" style={{ justifyContent:'space-between'}}>
                                                {
                                                    total > 0 ? (<>
                                                        <div className="d-flex">
                                                            <i className={`fa-solid fa-cash`} />
                                                            <p> Return </p>
                                                        </div>
                                                        <b>&nbsp; {currency} {Math.abs((total - paid()).toFixed(2))}</b>
                                                    </>) : (<>
                                                        <div className="d-flex">
                                                            <i className={`fa-solid fa-cash`} />
                                                            {
                                                                total > 0 && paid() > total ? <b> Put back { total.toFixed(2) - paid() }</b>
                                                                :(<><p> Return </p><b> &nbsp; {currency + Math.abs(total.toFixed(2) - paid())}</b></>)
                                                            }
                                                        </div>
                                                    </>)
                                                }
                                            </div>
                                        </div>
                                    </div>) : (
                                        <div className={`card remaining`}>
                                            <div className={`card-body exception`}>
                                                <div className="d-flex" style={{ justifyContent:'space-between' }}>
                                                    <div className="d-flex">
                                                        <i className={`fa-solid fa-cash`} />
                                                        {total > 0 ? <p>Remaining </p>: <p>Put Back</p>}
                                                    </div>
                                                    <b>&nbsp; {currency} {Math.abs((total - paid()).toFixed(2))}</b>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {
                                        paymentMethod.map( meth => <div className={`card methods payment-${meth.toLowerCase()} ${currentMethod===meth && 'active'}`} key={meth} onClick={()=> setCurrentMethod(meth)}>
                                            <div className={`card-body exception`} >
                                                <div className="d-flex" style={{justifyContent:'space-between'}}>
                                                    <div className="d-flex"> 
                                                        <p> { meth } </p>
                                                    </div>
                                                    <div className="d-flex">
                                                        &nbsp;{currency} &nbsp;<b className="price" > {byAll[meth]}</b>
                                                        <i className="mdi mdi-close mx-3" style={{cursor:'pointer'}} onClick={()=>setPaymentMethod(()=>{ 
                                                            setByAll({...byAll, [meth]:0})
                                                            return paymentMethod.filter(ite => ite !== meth)
                                                        })} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>) 
                                    }
                                </>
                            ): null}
                        </div>
                    </div>
                    <div className={`container`}>
                        <div className={`row`}>
                            {[5,10,20,50,100,200].map((note) => (
                                <div className="col-sm-4 mt-1" key={note} style={{maxHeight:'110px',cursor:'pointer'}} onClick={()=>choosePaymentMethod('Cash', note)}>
                                    <div className={'text-center bg-white'} style={{width:'100%',height:'100px',borderRadius:10, border:'1px solid',placeContent:'center'}} >
                                        <h2> <b>EUR {note}</b> </h2>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            {/* Receipt Area */}
            {<div className={`col-lg-5 ms-4 ${receiptOn ?'':'d-none'}`} id="receipt" >
                <div className="container" style={{backgroundColor:'white',paddingBottom:40,borderRadius:15,alignSelf:'center'}} >
                    <div className="row d-flex w-100">
                        <div style={{justifyContent:'center',display:'grid',textAlign:'center',width:'100%'}}>
                            <img src={pos} alt="" style={{marginTop:30, filter:'grayscale(1)'}} height={150}/>
                        </div>
                    </div>
                    <div className="row" ref={targetDiv} style={{justifyContent:'center'}}>
                        <div>
                            <div style={{textAlign:'center',marginTop:10}}> 
                                <h5 style={{textTransform:'uppercase',fontFamily:'Manrope, sans-serif'}}>
                                    <b style={{paddingTop:10}}>&#x260E;: 070-3563062</b><br/>
                                    <span>&#x1F6D2;</span>Hobbemaplein 50 <br/> 2526 JB Den Haag, Netherlands<br/>
                                </h5>
                            </div>
                        </div>
                        <div className="receipt" style={{width:'90%',background:'#fff'}}>
                            {
                                cartProducts[active]?.map( (product,l) => <div key={l} className='row' style={chosenStyle}>
                                    <div style={{ display:'flex',width:'100%',justifyContent:'space-between'}}>
                                        <div>
                                            <strong className='toShow' style={{fontSize:product.name.length > 35?'medium':'large',fontWeight:900,fontFamily:'Manrope, sans-serif',marginRight:6}}>{ product.stock + ' '+ (product.unit??'') }x</strong>
                                            <b style={{fontSize: product.name.length > 35?'medium':'larger',fontWeight:900,maxWidth:'80%',fontFamily:'Manrope, sans-serif'}}>{product.name}</b>
                                            {product.return ? (<><small className='toHide' style={labelStyle}>-</small></>): null } 
                                        </div>
                                        <strong className='price' style={{fontSize:'large', whiteSpace:'nowrap'}}>
                                            { `${product.return?'- ':''}` + currency + ' ' + parseFloat(product.stock * f(product.price)).toFixed(2) }
                                        </strong>
                                    </div>
                                    <div className='toHide' style={{fontSize:'larger',width:'100%',fontWeight:900,display:'flex',justifyContent:'space-between'}}>
                                        <span style={{fontFamily:'Manrope, sans-serif'}}> 
                                            { currency +' '+ f(product.price) }
                                            { typeof product.id ==='string' && product.id.indexOf('quick') !== -1 ? ' x': ( product.unit ? ` /${product.unit}` : '/ Units')}
                                        </span>
                                        <span style={{fontFamily:'Manrope, sans-serif'}}> 
                                            Qty: {product.unit ? proper(product.stock, product.unit): f(product.stock)}
                                        </span>
                                    </div>
                                </div>
                                )
                            }
                            <div>
                                {paymentMethod.map( (m,i) => {
                                    if(byAll[m]) {
                                        return <span key={i} style={{cssText:"font-size:1rem!important;font-weight:600;padding-right:15px"}}>{m +': '+currency +' '+byAll[m]}</span>
                                    }
                                    return null
                                })}
                            </div>
                           <h1 style={{cssText:"font-size:1.75rem!important;font-weight:600;margin-top:5px"}}> TOTAL &nbsp; {currency + ' ' + parseFloat(total).toFixed(2) }</h1> 
                           <h1 style={{cssText:"font-size:1rem;font-weight:600"}}>Products: {showQT(cartProducts[active])}</h1>
                           <div>{returnPart()}</div>
                           <div className="row">
                                <TaxTable taxes={showTaxes(cartProducts[active])} />
                            </div> 
                        </div>
                        <div style={{width:"100%", textAlign:'center'}}>
                            <p style={{paddingTop:10}}>Thank you! Visit Again!</p>
                            <p> {(new Date()).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>}
        </div>
    )
}