import { useRef } from 'react';
import $ from 'jquery';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { f, formatDatefromTimestamp, Warning } from '../helpers/utils';
import {Modal, ModalHeader, ModalBody, ModalFooter, Form, Card, CardBody } from 'reactstrap';
import toast from 'react-hot-toast';
import { useSearch } from '../contexts/SearchContext';
import pos from '../asset/images/logo.png';
import 'select2/dist/css/select2.min.css';
import axios from 'axios';
import 'select2';
import { printDivById } from '../helpers/attachments';
import { calTax, sanitize, TaxTable } from './layouts/Navbar';
$.fn.DataTable.ext.errMode = 'none';
export default function Sales() {
    const modalBody = useRef(null);
    const dispatch = useDispatch();
    const tableRef = useRef();
    const [ closing_cash ] = useState(0);
    const { setSession, setActiveSession } = useSearch();
    const [ taxes, setTaxAmounts] = useState([]);
    const [ order, setOrder ] = useState({});
    const [ orders, setOrders] = useState([]);
    const [ orderProducts, setOrderProducts] = useState([]);
    const [ open, setModal ] = useState(false);
    const [ reportModal, setReportModal ] = useState(false);
    const [ total, setTotal ] = useState(0);
    const [ dateOpts, setDateOptions ]= useState([]);
    const [ paymentMethod, setPaymentMethod ]= useState(0);
    const [ reportType, setReportType ] = useState('');
    const [ dates, setDates ] = useState({ from:'', to:''});

    const labelStyle = {
        fontSize:'0.8rem',
        padding:'0px 8px',
        borderRadius:12,
        background:'#ccbd67',
        color:'white',
        marginLeft:3
    }
    const chosenProduct = {
        marginTop:'.5rem',
        alignItems: 'center',
        borderRadius: '10px',
        minHeight: 20,
        border: '2px dashed',
        backgroundColor: '#fff',
        position: 'relative',
        padding:0
    }

    const { currency, openingCash, categories } = useSelector( state => state.auth );
    const keyboardRef = useRef(null);

    const setDate = e => {
        setToday(false);
        setDates({...dates, [e.target.name]: e.target.value })
    };
    const [today, setToday] = useState(true);
    
    const showQT = (products) => {
        let total = 0
        products.forEach( a => {
            let {stock, price} = a
            if(price > 0) {
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

    const view = id => {
        dispatch({ type:`LOADING` });
        axios.get(`orders/view-order/${id}`).then(({data})=> {

            const {products, session, order} = data;
            const sessionData = JSON.parse(session.data);
            setOrder({...order, ...sessionData})
            setTotal(data.order.amount);
            setPaymentMethod(data.order.payment_mode);
            let orderedProducts = Object.values(products).map( pr => ({...pr, stock:sessionData?.quantity[pr.id]}) );
            if((sessionData?.products??[]).indexOf('quick') !== -1) {
                let overallExcept = orderedProducts.reduce( (pre,a) => pre + parseFloat(a.price * sessionData?.quantity[a.id]), 0);
                let otherPrice = data.order.amount - overallExcept;
                // orderedProducts = [...orderedProducts, {name:"Others", price: otherPrice, id:`quick`, stock: sessionData?.quantity['quick']}];
                orderedProducts = [...orderedProducts, ...sessionData.products.filter( p => orderedProducts.findIndex( o => o.id === p) === -1 ).map( p => (
                    {
                        id:p,
                        name: typeof p ==='string' && p.indexOf('quick')!==-1 ? 'Others': p,
                        price: sessionData.price[p]??otherPrice,
                        stock: sessionData?.quantity[p]
                    }
                ))];
            }
            let cp =[];
            sessionData.products.forEach( pr => {
                cp.push(orderedProducts.find(p=>p.id===pr))
            })

            setOrderProducts(cp.map( p => {
                if(categories[p.category_id]) {
                    p.isVeg= true
                }
                p.prices = sessionData.price ?? {}
                p.units = sessionData.unit??{}
                p.modes = sessionData.modes??{}
                return p
            }));
            let xyz=[];
            cp.forEach(c=> {
                let index=0;
                let tax = sanitize(c.tax);
                index = xyz.findIndex( p => sanitize(p.tax) === tax )
                // now take the overall price like qt * unit price its in c.prices[c.id]
                if( index !== -1 ) {
                    xyz[index]['amount'] = Number(xyz[index].amount) + Number(calTax(tax, c.prices[c.id]));
                    xyz[index]['over'] = Number(xyz[index].over) + Number(c.prices[c.id]);
                } else {
                    xyz.push({tax, amount: calTax(tax, c.prices[c.id]), over: Number(c.prices[c.id]) });
                }
            })
            xyz = xyz.sort((a,b) => a.tax - b.tax);
            setTaxAmounts(xyz)
            toggleModal()

        }).catch((e)=> toast.error("Order details not found!"))
        .finally(()=> dispatch({ type:`STOP_LOADING` }))
    }

    const print = async e => {
        const elem = modalBody.current
        try {
            if(window.electronAPI) {
                window.electronAPI.printContent({ html: elem.innerHTML, raw: { orderProducts, order }});
            } else {
                printDivById('receipt');
                Warning("Printer not connected!");
            }
        } catch (error) {
            console.error("Error capturing image:", error);
        }
    }

    const toggleModal = () => setModal(!open)

    const toggleReport = () => setReportModal(!reportModal)

    const generateReceipt = async (e) => {
        e.preventDefault();

        if(reportType) {

            const payload = {
                currency,
                today,
                from: dates.from,
                to: dates.to,
                register_id: openingCash.id,
                closing_cash,
            }
            if(reportType==='X') {
                dispatch({ type:"LOADING" })
                
                const {data} = await axios.post(`/orders/x-report`, payload);
                if(data.status) {
                    toast.success(data.message );
                    if(window.electronAPI) {
                        window.electronAPI.printReport(data.html)
                    } else {
                        Warning("Printer not connected!");
                    }
                } else {
                    toast.error(data.message)
                }
                dispatch({ type:"STOP_LOADING" })

            } else {
                if(window.confirm("This will reset all sessions for current cash registered!")) {
                    
                    dispatch({ type:"LOADING" })
                    const {data} = await axios.post(`orders/z-report`, payload);
                    if(data.status) {
                        if(window.electronAPI){
                            window.electronAPI.printReport(data.html)
                        } else {
                            Warning("Printer not connected!");
                        }
                        localStorage.setItem('cartSessions','[1]');
                        setSession([1])
                        setActiveSession(1)
                        dispatch({ type:"RESET_KART" });
                        dispatch({ type: "DAY_CLOSE" })
                        toast.success(data.message)
                    } else {
                        toast.error(data.message);
                    }
                    dispatch({ type:"STOP_LOADING" })
                }
            }
        } else {
            Warning("Select type of report!");
        }
    }

    useEffect(()=> {
        axios.get('orders').then(({data}) => setOrders(data.orders)).catch(()=>{})
        return () => null
    },[])

    useEffect(() => {
        let table = $(tableRef.current).DataTable({
            data: orders,
            processing: true,
            paging: true,
            lengthMenu: [10, 25, 50, 100],
            pageLength: 10,
            searching: true,
            info: true,
            ordering: true,
            order: [],
            columns:[
                { title:'Order ID', data:'id'},
                { title:'Date', data:null, render: row => formatDatefromTimestamp(row.created_at)},
                { title:'Cash Register-ID', data:null, render: (ro) => ro.session?.cash_register_id},
                { title:'Session ID', data:'session_id'},
                { title:"Amount", data: null, render: row => currency + ' ' + parseFloat(row.amount).toFixed(2)},
                { title:"Cashier", data:null, render:row => row.cashier?.name },
                { title:"Action", data:null, render:row => `<a class="text-decoration-none" type="button" data-id="${row.id}">View</a>` },
            ],
            rowCallback: function (row, data) {
                if (!data.register || !data.register?.status) {
                    $(row).addClass("activated")
                }
            }
        });
        // 
        if(orders?.length) {
            let db_dates = orders.map( ro => formatDatefromTimestamp(ro.created_at, true));
            setDateOptions(db_dates.filter((obj, index, self) =>
              index === self.findIndex((o) => o === obj)
            ));
        } 
        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
            const nameFilter = $('select[name=dates]').val();
            const date = data[1];// column 0 = Category
            if (!nameFilter || date.split(' ')[0] === nameFilter) {
                return true;
            }
            return false;
        });
        $('select[name=dates]').select2()
        $('select[name=dates]').on('change', function(){
            table.draw()
        })
        document.activeElement.blur();
        // table.rows().invalidate().draw();
        $(tableRef.current).on('click', 'a', e=> view(e.target.dataset.id))
        // $(tableRef.current).on('ondrop', e => handleDrop(e))
        return ()=> $(tableRef.current).DataTable().destroy();
        
    },[orders])

    const [ preset ] = useState('')
    useEffect(()=> {
        keyboardRef.current?.setInput(preset)
    },[preset])

    return (
        <>
        <div className="content-wrapper" style={{width:'100%'}}>
            <div className="row">
                <div className="col-lg-12 grid-margin stretch-card">
                    <div className='d-block position-absolute' style={{zIndex:1,right:60}}>
                        <button className='btn btn-success btn-rounded' onClick={toggleReport}> Generate Report </button>
                    </div>
                    <div className="card mt-5">
                        <div className='card-header position-relative' style={{justifyContent:'space-between'}}>
                            <div className="flex-end d-flex w-100" style={{justifyContent:'space-between'}}>
                                <Link to={`/reports`} className='btn btn-info btn-sm btn-rounded'>View Reports</Link>
                                <div>
                                    <select name='dates' style={{width:170, borderRadius:20}}>
                                        <option value=""> Filter By Date</option>
                                        <option value=""> Reset </option>
                                        {dateOpts.map( ro => <option>{ro}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="table-responsive">
                                <table className="table table-hover table-bordered" ref={tableRef} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <Modal isOpen={reportModal} >
            <Form onSubmit={generateReceipt}>
                <ModalHeader>
                    <span className="report-type"> Generate-Report</span>
                </ModalHeader>
                <ModalBody>
                    <Card>
                        <CardBody>
                            <div className="card-body asking">
                                <div className="container" style={{placeItems:'center'}}>
                                    <div className="row">
                                        <b> Select Type </b>
                                    </div>
                                    <div className="row mt-2" style={{width:'122%'}}>
                                        <button className={`btn btn-rounded btn-success ms-3 ${reportType && reportType!=='X' ? 'btn-inactive':''}`} type='button' onClick={()=> setReportType('X')} style={{border:'5px solid #afe9f5'}}> X-Report </button>
                                        <button className={`btn btn-rounded btn-danger ms-3 ${reportType && reportType!=='Z'?'btn-inactive': ''}`} type='button' onClick={()=> setReportType('Z')} style={{border:'5px solid #afe9f5'}}> Z-Report </button>
                                    </div>
                                </div>
                            </div>
                            <div className="card-body the-report" style={{ display:reportType==='' && 'none',padding:0 }}>
                                <input type="hidden" name="type" defaultValue={reportType}/>
                                {reportType ==='X' && (<>
                                <div className="row mb-2">
                                    <div className="col-3">
                                        <label htmlFor=""> Today </label>
                                    </div>
                                    <div className="col-7">
                                        <input type="checkbox" name="today" checked={today} onChange={()=>setToday(!today)} />
                                    </div>
                                </div>
                                <div className="row mb-3">
                                    <div className="col-3" style={{alignSelf:'center'}}>
                                        <strong className="mt-3"> From </strong>
                                    </div>
                                    <div className="col-9">
                                        <input type="date" name="from" className="form-control" onChange={setDate} style={{float:'right'}}/>
                                    </div>
                                </div>
                                <div className="row">
                                    <div className="col-3" style={{alignSelf:'center'}}>
                                        <strong className="mt-3"> To </strong>
                                    </div>
                                    <div className="col-9">
                                        <input type="date" name="to" className="form-control" onChange={setDate} style={{float:'right'}}/>
                                    </div>
                                </div>
                                </>)}
                            </div>
                        </CardBody>
                    </Card>
                </ModalBody>
                <ModalFooter>
                    <button type="button" className="bg-light btn btn-rounded" onClick={toggleReport}>Close</button>
                    <button className="bg-info btn text-white btn-rounded" > Generate </button>
                </ModalFooter>
            </Form>
        </Modal>
       
        <Modal isOpen={open} >
            <ModalHeader>
                <p style={{fontSize:'1.5rem'}}>Order Details</p>
            </ModalHeader>
            <ModalBody >
                <div style={{width:'100%'}}>
                    <div className="container" style={{backgroundColor:'white',paddingBottom:'10px',borderRadius:'15px',fontSize:'larger'}} id='receipt'>
                        <div style={{display:'flex',fontSize:'larger'}}>
                            <div style={{justifyContent:'center',width:'100%',textAlign:'center',display:'grid'}}>
                                <img src={pos} alt='' style={{filter:"grayscale(1)"}} height={140} />
                            </div>
                        </div>
                        <div style={{marginTop:15}} ref={modalBody}>
                            <div style={{textAlign:'center'}}>
                                <h5 style={{textTransform:'uppercase'}}>
                                    <b style={{paddingTop:10}}>&#x260E;: 070-3563062</b><br/>
                                    <span>&#x1F6D2;</span>Hobbemaplein 50 <br/> 2526 JB Den Haag, Netherlands<br/> 
                                </h5>
                            </div>
                            <div className='receipt' style={{width:'100%',background:'#fff'}}>
                                {orderProducts.map( (order,i) => <div key={i} className='row' style={chosenProduct}>
                                        <div style={{display:'flex', width:'100%',justifyContent:'space-between'}}>
                                            <div>
                                                <strong className='toShow' style={{
                                                    fontSize:order.name.length > 35?'medium':'large',
                                                    fontWeight:900,
                                                    fontFamily:'Manrope, sans-serif',
                                                    marginRight:6
                                                }}>
                                                    { order.stock + ' '+ (order.units[order.id]??'') } x
                                                </strong>
                                                    <b style={{fontSize:order.name.length > 35?'medium':'large',fontWeight:900,maxWidth:'80%'}}>
                                                        {order.name}
                                                    </b>
                                                    { order.prices[order.id] < 0 ?
                                                    (<><small className='toHide' style={labelStyle}>-</small></>): null }
                                            </div>
                                            <strong style={{whiteSpace:'nowrap'}} >
                                                { order.prices[order.id] > 0 ? currency + f(order.prices[order.id]): `- ${currency}`+ Math.abs(f(order.prices[order.id]))} 
                                            </strong>
                                        </div>
                                        <div className={'toHide'} style={{display:'flex',width:'100%',justifyContent:'space-between'}}>
                                            <p style={{fontSize:'large',fontWeight:900,marginTop:'0.5rem'}}>
                                                { currency +' '+ Math.abs(parseFloat(order.prices[order.id] / order.stock).toFixed(2)) }
                                                { typeof order.id ==='string' && order.id.indexOf('quick') !== -1 ? ' x': ( order.units[order.id] ? `/ ${order.units[order.id]}` : '/ Units')}
                                            </p>
                                            <p style={{fontSize:'medium',fontWeight:900,marginTop:'0.5rem'}}>
                                                Qty: {order.isVeg? proper(JSON.stringify(order.stock), order.units[order.id]) :f(order.stock)}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className='desc row'>
                                    <div style={{lineHeight:1,marginTop:10}}> 
                                        <div>
                                        {order.modes ? Object.keys(order.modes).map( (m,i) => {
                                            if(order.modes[m] && m!=='Cash') {
                                                return <span key={i} style={{cssText:"font-size:1rem!important;font-weight:600;padding-right:15px"}}>
                                                    {(m==='ogCash'?'Cash':m)+': '+currency+' '+ f(order.modes[m])}
                                                </span>
                                            }
                                            return null
                                        }): paymentMethod.toString()?.replace(',','+')+': '+currency+' '+ f(total) }
                                        </div>
                                        <b style={{cssText:"font-size:1.75rem!important;font-weight:600"}}> TOTAL &nbsp; {currency + ' ' + f(total) }</b> <br/>
                                        <span style={{cssText:"font-size:1.25rem!important;font-weight:600;"}}>Products: {showQT(orderProducts)}</span>
                                        {order.r && (<><br/><span style={{cssText:"font-size:1rem!important;font-weight:600"}}>{order.r}</span></>)}
                                    </div>
                                </div>
                                <div className="row">
                                    <TaxTable taxes={taxes}/>
                                </div>
                            </div>
                            <div style={{width:"100%",textAlign:'center'}}>
                                <p>Thank you! Visit Again!</p>
                                <p> {(new Date(order.created_at)).toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </ModalBody>
            <ModalFooter>
                <button className='btn btn-light btn-rounded' onClick={()=> toggleModal(!open)}> Close </button>
                <button type='button' className='btn btn-primary btn-rounded' onClick={print}> Print </button>
            </ModalFooter>
        </Modal>
        </>
    )
}
