import React, { memo, useEffect, useRef, useState } from 'react'; 
import TouchKeyboard from '../common/TouchKeyboard';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import CreatableSelect from 'react-select/creatable'
import { useGetProductCategoriesQuery, useGetPosProductsQuery, commonApiSlice, useGetTaxesQuery } from '../../features/centerSlice';
import { chunk, Warning, dataURLtoFile, f } from '../../helpers/utils';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSearch } from '../../contexts/SearchContext';
import { Modal, ModalHeader, ModalBody, ModalFooter, Row, Label, Input, FormGroup, Col, Form } from 'reactstrap';
import toast from 'react-hot-toast';
import Category from './Category';
import Products from './Products';
import logo from '../../asset/images/logo.png'
import { Button } from '../layouts/Navbar';
let noCodeProducts=[]
function POS() {
    const cRef = useRef(null);
    const sectionRef = useRef(null);
    const keyboardRef = useRef();
    const ckeyboardRef = useRef();
    const dispatch = useDispatch();
    const location = useLocation();
    const navigator = useNavigate();
    const chunkSize = 6 //window.screen.availWidth < 1200? 3 : 4;
    const { 
        currency, 
        split, 
        cartStocks, 
        cartProducts, 
        openingCash, 
        appKey, 
        inventory, 
        theme, 
        hasKeyboard, 
        allProds 
    } = useSelector( state => state.auth );
    const [ key, setKey ] = useState(appKey);
    const [ appModal , setAppModal ] = useState(false)
    const [ openingAmountSet, setOpeningAmount ] = useState(openingCash)
    const [ enteredCash , setEnteredCash ] = useState('')
    const { data, isSuccess } = useGetProductCategoriesQuery()
    const [ products, setProducts ] = useState([])
    const [ catColors, putCats ] = useState({})
    const [ noProduct, setNoProduct ] = useState(false)
    const [ prCategories, setCategories ] = useState([])
    const [ initialProducts, setInitialProducts ] = useState([])
    const [ KartProducts, setCartProducts ] = useState(cartProducts);
    const { searchQuery, sessions, activeSession, displayImage, sale, quick } = useSearch()
    const [ currentProduct, setCurrent ] = useState(KartProducts[activeSession]?.length -1)
    const [ Other, toggleOther ] = useState(false)
    const [ otherOpen, setModal ] = useState(false)
    const [ availableStocks, setAvailableStocks ] = useState(cartStocks);
    const [ barcode, setBarcode ] = useState('');
    const [ number, setNumber ] = useState('');
    const [ qty, setQty ] = useState('');
    const [ editing, setEditing ] = useState(false);
    const [ loadingPhone, setLoading ]= useState(false);
    const [ editingQT, setEditingQT ]= useState(false);
    const [ custom, setCustom] = useState({image:null, price:'', name:'', barcode:'', stock:5000});
    // for v-keyboard
    const [ focused, setFocused] = useState('');
    const [ focusedCustom, setFocusedCustom] = useState('');
    const fillCustom = e => {
        if(['price', 'name', 'barcode', 'stock'].includes(focusedCustom)) {
            setCustom({...custom, [focusedCustom]: e})       
        }
    }
    const toPayment = () => navigator(`/payment/${activeSession}`)



    // end for v-keyboard
    const btnStyle = {minHeight:60, fontSize:'1.5rem', touchAction:'manipulation'}
    
    useEffect(() => {
        let inputBuffer = "";
        const handleKeyDown = event => {
            const { key } = event;
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
                return; // Do nothing if an input field is focused
            }
            if (key === "Enter") {
                event.preventDefault();
                setBarcode(inputBuffer);inputBuffer=""; 
            } else {
                if (key.length === 1) {
                    inputBuffer += key;
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [barcode]);

    useEffect(()=> {
        const handleClick = event => {
            if(!event.target.classList.contains('num') && !event.target.classList.contains('calc')) {
                setNumber('');
                setQty('')
                setEditing(false);
                setEditingQT(false);
            }
        }
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick)
    },[])
    
    const allProducts = useGetPosProductsQuery();

    useEffect(() => {
        if(allProducts.data?.products){
            setProducts(chunk(allProducts.data.products.filter(ite => (ite.name).toLowerCase().includes(searchQuery.toLowerCase())), chunkSize))
        }
        return () => setProducts([]);
    },[searchQuery])

    const scrollTop = e => window.scrollTo(0,0)

    const fetchPhoneProducts = async (e) => {
        e.preventDefault()
        try {
            setLoading(true);
            if(!key) {
                return setAppModal(!appModal)
            }
            dispatch({ type: "SET_APP_KEY", payload: key })
            dispatch({ type:"LOADING" });

            const {data} = await axios.get(`/products/sync/${key}`);
            if(data.status) {
                    toast.success("Importing completed");
                    setTimeout(()=> window.location.reload(), 2400);
            } else {
                toast.error(data.message);
            }
            
        } catch (error) {
            console.log(error.message);
            toast.error("Couldn't fetch products right now!")
        }
        dispatch({ type:"STOP_LOADING" });
        setLoading(false)
    }
    
    const addToCart = prID => 
    {
        setEditingQT(false); setQty('');
        let product = initialProducts.find(ite => ite.id === prID);

        if(product.catName && (['vegetables','sweets'].includes(product?.catName?.trim().toLowerCase()) || (product.name.toLowerCase()==='paneer')) && !cartProducts[activeSession]?.find(i => i.id===prID)) {

            if( availableStocks[product.id] === 0 || parseInt(product.quantity) === 0 ) return 

            product = {...product, unit:'kg', stock:'1'}
            if(!sale) {
                product = {...product, return: true}
            }
            // setVegetable(product)
            // return handleVegetable() 
        }
        const copyKartProducts = JSON.parse(JSON.stringify(KartProducts));
        // Only merge with a line of the same kind: a return tap must not turn the sale line of the
        // same product into a return (selling 2 then returning 1 used to become "return 3").
        const sameKind = ite => ite.id === prID && Boolean(ite.return) === !sale;
        let thisProduct = copyKartProducts[activeSession]?.find(sameKind);
        // check if the product is already in cart
        if( thisProduct && !split ) {

            let canAdd= thisProduct.quantity - availableStocks[prID]
            canAdd = canAdd < 1 ? canAdd : 1;
            let updatedStock = (thisProduct.stock-0) + canAdd;
            let availableStock = product.quantity - updatedStock;

            if(inventory && sale && availableStock < 0 ) {
                return document.querySelector('.also[data-id="'+product.id+'"]').classList.add('stock-out');
            }
            let currentIndex
            if(!split) {  // update the current project highlight
                currentIndex = KartProducts[activeSession].findIndex(sameKind)
            } else { // update the current project highlight if splittin products is off
                currentIndex = KartProducts[activeSession]?.length??0
            }
            setCurrent(currentIndex)
            // update the remaining stock each product
            if(inventory && sale) setAvailableStocks({...availableStocks, [product.id]: availableStock });
            thisProduct.stock = updatedStock;
            if(!sale) { // if its not for sale then it is in return process
                thisProduct.return = true
            }
            setCartProducts(copyKartProducts);
            dispatch({ type: "CHOOSEN_PRODUCT", payload:copyKartProducts });
            window.electronAPI?.reloadWindow({...copyKartProducts, id: thisProduct.id })

        } else {

            setCurrent(KartProducts[activeSession]?.length??0 ) 

            product = {...product, stock: 1 }

            let consumed = Object.values(KartProducts).flat()?.filter( item => item.id === product.id).reduce( (prev, item) => prev + item.stock, 0 )?? 0;

            let availableStock = product.quantity - ( consumed + 1 );
            
            if(inventory && sale && availableStock === -1 ) {
                return document.querySelector('.also[data-id="'+product.id+'"]').classList.add('stock-out');
            }
            if(inventory && sale) setAvailableStocks({...availableStocks, [product.id]: availableStock });
            
            if(!sale) {
                product = {...product, return : true }
            }

            let rest = {...KartProducts,[activeSession]: [...KartProducts[activeSession]??[], product] }
            setCartProducts(rest);

            dispatch({ type: 'CHOOSEN_PRODUCT', payload: rest });
            // update the current project highlight
            window.electronAPI?.reloadWindow({...rest, id: product.id })
        }

    }

    const resetCart = () => {
        let rest = {...KartProducts, [activeSession]: []}
        setCartProducts(rest);
        dispatch({ type: "CHOOSEN_PRODUCT", payload: rest });
        window.electronAPI?.reloadWindow({ ...rest, id:0 })
    }

    // Reverse the stock decrement here
    const removeFromCart = index => {
        let rest = {...KartProducts,[activeSession]: KartProducts[activeSession].filter((item, i)=> i!== index) }
        setCartProducts(rest);
        dispatch({ type: 'CHOOSEN_PRODUCT', payload: rest });
        window.electronAPI?.reloadWindow({...rest, id:0})
    }

    const toggleModal = () => setModal(!otherOpen)

    const openTheFuckingDay = e => {
        e.preventDefault();
        if(!enteredCash || enteredCash === '0') return Warning("You can't open without a single cash amount in drawer!");

        dispatch({ type: "LOADING" });
        axios.post("pos/opening-day-cash-amount", {cash: currency + enteredCash}).then(({data}) => {
            
            if(data.status) {
                toast.success(data.message);
                dispatch({ type: "SET_CASH", payload: data.created })
                setOpeningAmount(data.created)
                setFocused('')
            } else toast.error(data.message);

        }).catch(()=>{}).finally(()=>dispatch({ type: "STOP_LOADING" }))

    }

    const showRate = (stock, unit) => {
        if( typeof stock==='string' && unit && ([0,1].includes(stock.indexOf('.')) && (stock[0]==='0' || stock[0]==='.'))) {
            stock = stock * 1000
            if(unit && unit==='kg') {
                unit = stock > 1000 ? unit: 'gm'
            } else if(unit) {
                unit = stock > 1000 ? unit: 'mg'
            }
        }
        stock = parseFloat(stock).toFixed(2)
        return stock + (unit? ` ${unit}`: '')
    }

    const [items, setItems] = useState(prCategories);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);

    const handleDragStart = (index) => setDraggedItemIndex(index)

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItemIndex === index) return;
        const newItems = [...items];
        const draggedItem = newItems.splice(draggedItemIndex, 1)[0];
        newItems.splice(index, 0, draggedItem);
        setDraggedItemIndex(index);
        setItems(newItems);
        dispatch(
            commonApiSlice.util.updateQueryData(`getProductCategories`, undefined, cache=> {
                cache['categories'] = newItems
            })
        )
        setCategories(newItems);
    };

    const handleDrop = () => setDraggedItemIndex(null)

    const filterProducts = catID => {
        if(allProducts.isSuccess && allProducts.data.products) {
            if(allProds) {
                setProducts(chunk(allProducts.data.products.filter(ite => ite.category_id===catID),chunkSize));toggleOther(!catID)
                if(chunk(allProducts.data.products.filter(ite => ite.category_id===catID),chunkSize)) setNoProduct(true)
            } else {
                setProducts(chunk(allProducts.data.products.filter(ite => ite.category_id===catID && !ite.code),chunkSize));toggleOther(!catID)
                if(chunk(allProducts.data.products.filter(ite => ite.category_id===catID && !ite.code),chunkSize)) setNoProduct(true)
            }
        }
    }

    useEffect(()=> {
        filterProducts(prCategories[0]?.id)
        return ()=> null
    },[allProds])

    const scrollToSection = (id=null) => {
        let el = document.querySelector(`.chosen-product.selected`);
        if(el) {
            el.scrollIntoView({
                behavior:'smooth',
                block: 'center'
            })
        }
        if(id){
            setTimeout(() => {
                const elem = document.querySelector('.chosen-product[data-id="'+id+'"]');
                if(elem) {
                    if(elem) {
                        elem.scrollIntoView({
                            behavior:'smooth',
                            block: 'center'
                        })
                    }
                } 
            }, 1000);
        }
    };

    useEffect(()=> {
        if(barcode) {
            axios.get(`products/barcode/${barcode}`).then(({data})=> {
                if(!data.status) {
                    Warning("Product not in inventory!")
                    toggleModal()
                    setCustom(()=> ({...custom, barcode: barcode}))
                }
                setBarcode('')
                addToCart(data.product.id)
            }).catch(()=>{}).finally(()=> null);
        } 
        return () => setBarcode('')
    },[barcode])

    const [taxes, setTaxes] = useState([]);
    const { data:dbtaxes, isSuccess:taxLoaded } = useGetTaxesQuery();

    useEffect(()=>{
        if(taxLoaded) {
            setTaxes(dbtaxes.taxes)
        }
        return ()=> null
    },[taxLoaded, dbtaxes])

    useEffect(() => {
        if( isSuccess ) {
            setCategories(data.categories)
            const cats = []
            data.categories.forEach( cat => (cats[cat.id] = cat.color))
            putCats(cats)
            setItems(data.categories)
        }

        if(allProducts.isSuccess) {

            if(allProducts.data.products?.length === 0 )
            {
                setNoProduct(true);
            } else {
                setNoProduct(false);
            }
            
            noCodeProducts = allProducts.data.products.filter(it => !it.code);
            setProducts(chunk(allProducts.data.products, chunkSize))
            setInitialProducts(allProducts.data.products)
            filterProducts(data?.categories[0]?.id)

        }

        return () => {
            setInitialProducts([])
            setProducts([])
        }

    },[ isSuccess, data, allProducts.data, allProducts.isSuccess, navigator ])

    useEffect(()=> {
        setCartProducts(cartProducts);
        scrollToSection()
        return () => {
            setCartProducts([]);
        }
    },[ cartProducts ]);

    useEffect(()=> {
        if(cartProducts[activeSession]) {
            setCurrent(cartProducts[activeSession].findLastIndex( pr => pr.id==='quick'))
            scrollToSection()
        }
    },[quick])

    useEffect(()=> {
        if(cartStocks){
            setAvailableStocks(cartStocks)
        }
        return () => setAvailableStocks({})
    },[location, cartStocks])
 
    const base = {
        height:'69vh',
        placeContent:'center',
        display:'grid',
        placeItems:'center',
        width:'100%',
        backgroundColor: '#dadada',
        marginTop:'5%'
    }

    const addCustomProduct = async e => 
    {
        e.preventDefault();
        const fd = new FormData();
        fd.append('name', custom.name);
        fd.append('price', custom.price);
        fd.append('barcode', custom.barcode);
        fd.append('quantity', custom.stock);
        fd.append('image', custom.image);
        fd.append('tax', custom.tax);
        if(!custom.name || !custom.price ) {
            return Warning('Fill the required fields');
        }
        if(custom.name?.toLowerCase().indexOf('veg') === -1 && !custom.barcode) {
            return Warning("Barcode is required!")
        }

        dispatch({ type:'LOADING' })
        const {data} = await axios.post(`/products/create-custom`, fd, {
            headers:{ 
                "Accept" :"application/json",
                "Content-Type" : "multipart/form-data",
                "pos-token" : localStorage.getItem('pos-token')
            }
        });
        dispatch({ type:'STOP_LOADING' })
        if( data.status ) {
            setInitialProducts(prev => [...prev, data.product])
            dispatch(
                commonApiSlice.util.updateQueryData('getPosProducts', undefined, cache => {
                    const {products} = cache
                    if(products){
                        products.push(data.product)
                    }
                })
            )
            dispatch(
                commonApiSlice.util.updateQueryData('getProducts', undefined, cache => {
                    const {products} = cache
                    if(products){
                        products.push(data.product)
                    }
                })
            )
            setCustom(() => ({image:null, price:'', name:'', barcode:'', stock:5000, return :true}))
            let {product} = data;
            if(!sale) {
                product = {...product, return :true}
            }
            setCurrent(KartProducts[activeSession]?.length??0)
            product = {...product, stock: 1 }
            let consumed = Object.values(KartProducts).flat()?.filter( item => item.id === product.id).reduce( (prev, item) => prev + item.stock, 0 )?? 0;
            let availableStock = product.quantity - ( consumed + 1 );
            if(inventory && availableStock === -1 ) {
                return document.querySelector('.also[data-id="'+product.id+'"]').classList.add('stock-out');
            }
            if(inventory) setAvailableStocks({...availableStocks, [product.id]: availableStock });
            setCartProducts({...KartProducts,[activeSession]: [...KartProducts[activeSession]??[], product] });
            window.electronAPI?.reloadWindow({...KartProducts,[activeSession]: [...KartProducts[activeSession]??[], product], id: product.id })
            dispatch({ 
                type: 'CHOOSEN_PRODUCT', 
                payload: {...KartProducts,[activeSession]: [...KartProducts[activeSession]??[], product] } 
            });
            toast.success(data.message);
            setFocusedCustom('')
            toggleModal(!otherOpen)
            
        } else { 
            toast.error(data.message);
        }   
    }

    const handleFile = e => {
        const file = e.target.files[0]
        setCustom({...custom, image: file})
    }
    
    const {type} = useParams();

    useEffect(() => {

        const handleDataReceived = (data) => {
            if (data && data.reload) {
                if (type === "customer") {
                    setCartProducts(typeof data.products === "string" ? JSON.parse(data.products) : data.products)
                    scrollToSection(data.id)
                }
            }
            if(data.manual){
                window.location.reload()
            }
        }
        window.electronAPI?.onDataReceived(handleDataReceived)

    }, [])

    const showTotal = (tax=false) => {
        
        if(KartProducts && KartProducts[activeSession]?.length){
            let additions = KartProducts[activeSession].filter( item => item.return === undefined )
            let returns = KartProducts[activeSession].filter( _ => _.return === true )
            let addTaxes = additions.reduce((a,c) => (a + (c.stock * c.taxAmount)), 0)
            let remTaxes = returns.reduce((a,c) => (a + (c.stock * c.taxAmount)), 0)
            additions = additions.reduce((acc, cur)=> acc + (cur.stock * parseFloat(cur.price)),0)
            returns = returns.reduce((acc, cur)=> acc + (cur.stock * parseFloat(cur.price)),0)
            if(tax) {
                return f(addTaxes-remTaxes)
            }
            return parseFloat(additions - returns).toFixed(2)

        } else {

            if(cartProducts && cartProducts[activeSession]?.length)
            {
                let additions = cartProducts[activeSession].filter( item => item.return === undefined )
                let returns = cartProducts[activeSession].filter( _ => _.return === true )
                additions = additions.reduce((acc, cur)=> acc + (cur.stock * parseFloat(cur.price)),0)
                returns = returns.reduce((acc, cur)=> acc + (cur.stock * parseFloat(cur.price)),0)
                return parseFloat(additions - returns).toFixed(2)
            }
        }
        return 0;
        
    }
    
    const changeInput = (input,e) =>
    {
        e.preventDefault();
        e.stopPropagation();
        if( editing ) { // price
            let newPriceAmount;
            if(input==='clear') {
                newPriceAmount = '0'
                setNumber('');
            } else if(input==='back') { // remove the last digit instead of wiping everything
                const next = String(number).slice(0, -1);
                newPriceAmount = next || '0';
                setNumber(next);
            } else {
                newPriceAmount = number + input
                setNumber(number + input);
            }

            dispatch({
                type:"CHOOSEN_PRODUCT",
                payload: {...KartProducts,[activeSession]: KartProducts[activeSession].map((item, i)=> {
                    if(i === currentProduct ) {
                        item = { ...item, price:newPriceAmount }
                    }
                    return item
                })}
            });

            window.electronAPI?.reloadWindow({ ...KartProducts,[activeSession]: KartProducts[activeSession].map((item, i)=> {
                if(i=== currentProduct ) {
                    item = {...item, price: newPriceAmount }
                }
                return item
            }), id: KartProducts[activeSession][currentProduct]?.id })
            return
        }
        let newStockAmount;
        if( editingQT ) {
            if(input==='clear') {
                newStockAmount = '0';
                setQty('');
            } else if(input==='back') {
                const next = String(qty).slice(0, -1);
                newStockAmount = next || '0';
                setQty(next);
            } else {
                newStockAmount = qty + input;
                if(inventory) {
                    let { quantity, unit } = cartProducts[activeSession][currentProduct];
                    if(unit) {
                        if(unit==='gm') {
                            quantity *= 1000
                        }
                        if(unit==='mg') {
                            quantity *= 1000000
                        }
                    }
                    if( parseFloat(newStockAmount) > parseFloat(quantity)) return Warning( newStockAmount +` ${unit? unit:''} stocks are not available` );
                }
                setQty(newStockAmount);
            }

            dispatch({
                type:"CHOOSEN_PRODUCT",
                payload: {...KartProducts,[activeSession]: KartProducts[activeSession].map((item, i)=> {
                    if(i=== currentProduct ) {
                        item = {...item, stock:newStockAmount }
                    }
                    return item
                })}
            })
            window.electronAPI?.reloadWindow({...KartProducts,[activeSession]: KartProducts[activeSession].map((item, i)=> {
                if(i=== currentProduct ) {
                    item = {...item, stock:newStockAmount }
                }
                return item
            }), id: KartProducts[activeSession][currentProduct]?.id })
        }
    }

    const [presetTxt, setPreset] = useState('');

    useEffect(() => {
        ckeyboardRef.current?.setInput(typeof presetTxt==='number'? JSON.stringify(presetTxt): presetTxt)
    }, [presetTxt, focusedCustom])
    
    useEffect(() => {
        keyboardRef.current?.setInput(typeof presetTxt ==='number'? JSON.stringify(presetTxt): presetTxt)
    }, [presetTxt, focused])

    // handling size



    return (
        <>
            <div className={`col-md-12 position-relative ${type==='customer' && "d-flex align-self-center"}`} >
                { (Object.keys(openingAmountSet).length === 0 || !openingAmountSet.status === true) && type!=='customer'? (
                    <div className='overlay' style={{width:'100vw', height:'100vh',position:'absolute'}}>
                        <Modal isOpen={true}>
                            <Form onSubmit={openTheFuckingDay}>
                                <ModalHeader>
                                    <b>Day Opening!</b> <p>Good morning </p>
                                </ModalHeader>
                                <ModalBody>
                                    <Row>
                                        <Col>
                                            <FormGroup>
                                                <Label>
                                                    <b>Enter Opening Cash In Drawer</b>
                                                </Label>
                                                <Input
                                                    type={'text'}
                                                    placeholder={currency}
                                                    onClick={(e)=>{
                                                        setFocused('cash')
                                                        setPreset(enteredCash)
                                                    }}
                                                    onChange={e => setEnteredCash(e.target.value)}
                                                    value={enteredCash}
                                                    style={{border:'1px solid gray'}}
                                                />
                                            </FormGroup>
                                        </Col>
                                    </Row>
                                </ModalBody>
                                <ModalFooter className={'justify-content-center'}>
                                    <Col md={5} className='btn btn-light' onClick={()=> navigator('/')} >
                                        Back
                                    </Col>
                                    <Col md={5} >
                                        <button className='w-100 btn btn-success' type={`submit`} > Start </button>
                                    </Col>
                                </ModalFooter>
                            </Form>
                        </Modal>
                    </div>
                ): null}
                <div className={`col-md-4 pt-3 ${type==='customer'?'':'position-fixed'}`} 
                    style={{
                        filter:Object.keys(openingAmountSet).length === 0 || !openingAmountSet.status === true ? 'blur(5px)':'',
                        width:type==='customer'?'40vw':'38.8%'
                    }}
                >
                    {
                        type==='customer' && <div>
                            <h2 className='text-center' style={{ fontSize:'3rem', fontWeight:'900' }}>
                            {currency +' '+showTotal()} 
                            </h2>
                        </div>
                    }
                    { sessions.map( session => (<div key={session} ref={sectionRef} className={`container ms-2 put-here ${activeSession===session?'':'d-none'} ${KartProducts[activeSession] && KartProducts[activeSession].length && type!=='customer' ?'action-visible':''}`} 
                        style={{
                            borderRadius:'20px',
                            backgroundColor:'#dadada'
                        }}>
                        <div className={`card ${KartProducts[activeSession] && KartProducts[activeSession].length? 'd-none':''}`} style={base}>
                            <i className={`fa-solid fa-cart-shopping`} style={{fontSize:'60px'}} />
                            <b className={`mt-3`}> Start adding products </b>
                        </div>
                        { KartProducts[activeSession] && KartProducts[activeSession].map( (item,index) => (
                            <div key={index}
                                className={`row chosen-product mt-2 ${currentProduct===index && 'selected'} ${item.other?' other-product ':''}`} 
                                data-id={item.id}
                                data-index={index}
                                onClick={()=>setCurrent(index)}
                                style={{
                                    border:item.return && '2px dashed orange',
                                    background: item.return && '#f9f2c5',
                                    color: item.return && 'black'
                                }}
                            >
                                <div className={`d-flex w-100`}>
                                    <b style={{maxWidth:'24rem'}}> {item.name} </b>
                                    <strong className={`price`}>
                                        {item.return ? '-':null} {currency +' '+ (item.stock * f(item.price)).toFixed(2)}
                                    </strong>
                                </div>
                                <div className={`d-flex`}>
                                    <span className={`quantity`}>
                                        {type==='customer' && 'Qty:'} {showRate(item.stock, item.unit)}
                                    </span>
                                    {item.id!=='quick' && <span className={`ms-3`}>{`${currency + ' ' + f(item.price)} / ${item.unit? item.unit : 'Units'}`}</span>}
                                </div>
                                { type !=='customer' && 
                                    <button
                                        className={`${ currentProduct === index && !item.return && theme === 'retro' ? "text-white":''} btn`}
                                        onClick={()=>removeFromCart(index)}
                                    >
                                        <i className="mdi mdi-close"/>
                                    </button>
                                }
                            </div>
                        ))}

                    </div>))
                    }
                    <div className={`container ms-2 mt-3 actionBar ${KartProducts[activeSession] && KartProducts[activeSession].length && type!=='customer' ? '':'d-none'}`} style={{height: '54vh'}}>
                        <div className="row">
                            <div className="col-sm-12 d-flex">
                                <div className="col-sm-6">
                                    <button
                                        type='button'
                                        className='btn btn-light btn-rounded text-white'
                                        style={{backgroundColor:'#04537d',width:'93%', zIndex:9999}}
                                        onClick={toPayment}
                                        onPointerUp={toPayment}
                                    > Payment </button>
                                </div>
                                <div className="col-sm-6 d-flex justify-content-end align-items-center position-relative">
                                    <div className='position-absolute'>
                                        <p style={{lineHeight:2.1,whiteSpace:'nowrap'}}>
                                            <b> Total: &nbsp;
                                                <span className="total-amount" style={{left:0,fontSize:'2.3rem'}}>
                                                    {currency} { showTotal() }
                                                </span>
                                            </b>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="row mt-1">
                            {[ 1, 2, 3 ].map( it => <div className="col-sm-3 calc" key={it} onClick={(e)=> changeInput(it,e)}>
                                <button className="btn btn-light num w-100 text-dark" disabled={!editing && !editingQT} style={btnStyle}> <b> {it} </b> </button>
                            </div>)}
                            <div className="col-sm-3" onClick={resetCart}>
                                <button className="btn btn-light text-dark w-100 num" type="button" style={{...btnStyle,padding:10,fontSize:'1.1rem'}}> <b>Cancel Sale</b> </button>
                            </div>
                        </div>
                        <div className="row mt-1">
                            { [4,5,6].map( it => <div className="col-sm-3 calc" key={it} onClick={(e)=> changeInput(it,e)}>
                                <button className="btn btn-light num w-100 text-dark" disabled={!editing && !editingQT} style={btnStyle}> <b> {it} </b> </button>
                            </div>)}
                            <div className="col-sm-3 calc" onClick={(e)=> changeInput('back',e)}>
                                <button className="btn btn-light num w-100 text-dark" disabled={!editing && !editingQT} style={btnStyle} aria-label="Backspace">
                                    <i className="mdi mdi-backspace-outline" />
                                </button>
                            </div>
                        </div>
                        <div className="row mt-1">
                            {[7,8,9].map( ite => <div className="col-sm-3 calc" key={ite} onClick={(e)=> changeInput(ite,e)}>
                                <button className="btn btn-light num w-100 text-dark" disabled={!editing && !editingQT} style={btnStyle}> <b> {ite} </b> </button>
                            </div>)}
                            <div className="col-sm-3 calc" onClick={()=> {
                                if( editingQT===true ) {
                                    setQty('')
                                }
                                setEditing(false);
                                setEditingQT(!editingQT);
                            }}>
                                <button className='btn btn-light num w-100' style={{...btnStyle,padding:10,fontSize:'1.1rem'}}>
                                    <b className='num'>{!editingQT?'Edit Qty':'Done'}</b>
                                </button>
                            </div>
                        </div>
                        <div className="row mt-1">
                            <div className="col-sm-3">
                                <button className="btn btn-light num w-100 text-dark calc" disabled={!editing && !editingQT} onClick={e => changeInput('.',e)} style={btnStyle}> <b> . </b> </button>
                            </div>
                            <div className="col-sm-3">
                                <button className="btn btn-light num w-100 text-dark calc" disabled={!editing && !editingQT} onClick={e=> changeInput(0, e)} style={btnStyle}> <b> 0 </b> </button>
                            </div>
                            <div className="col-sm-3">
                                <button className="btn btn-light num w-100 text-dark" disabled={!editing && !editingQT} onClick={e=>changeInput('clear',e)} style={{...btnStyle,padding:'15px 10px',fontSize:'1.1rem'}}> <b>Reset</b> </button>
                            </div>
                            <div className="col-sm-3" onClick={(e)=> {
                                setEditingQT(false)
                                setEditing(!editing)
                            }}>
                                <button className="btn btn-light num w-100 text-dark" style={{...btnStyle,padding:10,fontSize:'1.1rem'}}> 
                                    <b className='num'> {!editing?'Edit Price':'Done'} </b> 
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
                {type!=='customer' ? 
                <div className="col-md-7 position-absolute library" 
                    style={{
                        height:'70vh',
                        right:'5px',
                        filter: Object.keys(openingAmountSet).length === 0 || !openingAmountSet.status === true ? 'blur(5px)':''
                    }}
                >
                    <Category 
                        categories={prCategories} 
                        products={noCodeProducts}
                        cRef={cRef} 
                        withAll={allProds}
                        filter={filterProducts} 
                        handleDragStart={handleDragStart}
                        handleDragOver={handleDragOver}
                        handleDrop={handleDrop}
                        scrollTop={scrollTop}
                    />
                    <Products 
                        categories={prCategories}
                        products={products}
                        addToCart={addToCart}
                        cartStocks={cartStocks}
                        displayImage={displayImage}
                        Other={Other}
                        chunkSize={chunkSize}
                        toggleModal={toggleModal}
                        otherOpen={otherOpen}
                        catColors={catColors}
                        isInventory={inventory}
                    />
                    {products.length === 0 && !Other && (<div className="lib-loader justify-content-center align-items-center" 
                    style={{height:'30rem',placeContent:'center',textAlign:'center'}} >
                        {
                            noProduct && isSuccess? <>
                            <h2>  {prCategories.length ? `No products ${!allProds?'without barcode':''} for this category`: 'No products...'}</h2>
                            <button className='btn btn-rounded btn-warning fs-4' onClick={fetchPhoneProducts}>
                                { loadingPhone? <i className='fa fa-spin fa-spinner'/>:'Sync phone products'}
                            </button>
                            </> :
                            <i className='fa fa-spin fa-spinner' />
                        }
                        
                    </div>)}
                </div>: 
                <div className='library d-grid justify-content-center align-items-center w-100'>
                    <center>
                        <img src={logo} alt="" />
                    </center>
                </div>
                }
            </div>
            <Modal isOpen={otherOpen} fade={false}>
                <Form onSubmit={addCustomProduct}>
                <ModalHeader >
                    Add Custom Product
                </ModalHeader>
                <ModalBody style={{padding:20}}>
                    <Row>
                        <div className='col-4'>
                            <Label> Name </Label>
                        </div>
                        <div className='col-8'>
                            <FormGroup>
                                <input 
                                    type='text'
                                    onChange={e => setCustom({...custom, name: e.target.value})}
                                    value={custom.name}
                                    onClick={e => {
                                        setFocusedCustom('name')
                                        setPreset(custom.name)
                                    }}
                                    className='input'
                                />
                            </FormGroup>
                        </div>
                    </Row>
                    <Row>
                        <div className='col-4'>
                            <Label> Price </Label>
                        </div>
                        <div className='col-8'>
                            <FormGroup>
                                <input 
                                    type='text'
                                    className='input'
                                    onChange={e => setCustom({...custom, price: e.target.value})}
                                    onClick={e => {
                                        setFocusedCustom('price')
                                        setPreset(custom.price)
                                    }}
                                    value={custom.price}
                                    placeholder={currency}
                                />
                            </FormGroup>
                        </div>
                    </Row>
                    <Row>
                        <div className='col-4'>
                            <Label> Tax </Label>
                        </div>
                        <div className='col-8'>
                            <FormGroup>
                                <CreatableSelect 
                                    name='tax'
                                    onFocus={()=> setFocused('')}
                                    onChange={e =>{setCustom({...custom, tax: e.value })}}
                                    options={taxes.map( t => ({...t, value: t.name +' '+t.amount, label: t.name+' '+t.amount}))}
                                />
                            </FormGroup>
                        </div>
                    </Row>
                    <Row>
                        <div className='col-4'>
                            <Label> Stock </Label>
                        </div>
                        <div className='col-8'>
                            <FormGroup>
                                <input 
                                    type='text'
                                    className='input'
                                    onChange={e => setCustom({...custom, stock: e.target.value})}
                                    onClick={ e => {
                                        setFocusedCustom('stock')
                                        setPreset(custom.stock)
                                    }}
                                    value={custom.stock}
                                />
                            </FormGroup>
                        </div>
                    </Row>
                    <Row>
                        <div className='col-4'>
                            <Label> Barcode </Label>
                        </div>
                        <div className='col-8'>
                            <FormGroup>
                                <input 
                                    type='text'
                                    className='input'
                                    placeholder='Enter barcode'
                                    onChange={e => setCustom({...custom, barcode: e.target.value})}
                                    value={custom.barcode}
                                    onClick={e => {
                                        setFocusedCustom('barcode')
                                        setPreset(custom.barcode)
                                    }}
                                />
                            </FormGroup>
                        </div>
                    </Row>
                    <Row>
                        <label className='custom-file-upload' > 
                            <i className={'fa fa-paperclip'} /> &nbsp;
                            <Input 
                                type='file' 
                                className='d-none'
                                accept='image/*'
                                onChange={handleFile}
                            />
                            Upload Product Image
                        </label>
                    </Row>
                </ModalBody>
                <ModalFooter>
                    <button className='btn btn-light btn-rounded' type='button' onClick={()=> {
                        toggleModal(!otherOpen)
                        setFocusedCustom('')
                    }} > Close </button>
                    <button className='btn btn-primary btn-rounded'> Submit </button>
                </ModalFooter>
                </Form>
            </Modal>
            <Modal isOpen={appModal} size='sm' fade={false}>
                <Form onSubmit={fetchPhoneProducts}>
                    <ModalHeader>
                        Enter application key 
                    </ModalHeader>
                    <ModalBody>
                        <Input onChange={e=> setKey(e.target.value)} type='text' name='appKey'/>
                    </ModalBody>
                    <ModalFooter>
                        <button className='btn btn-light btn-sm btn-rounded' type='button' onClick={()=> setAppModal(!appModal)}>Cancel</button>
                        <button className='btn btn-success btn-sm btn-rounded' > Submit </button>
                    </ModalFooter>
                </Form>
            </Modal>
            {focused && !hasKeyboard && <TouchKeyboard
                open
                value={enteredCash}
                onChange={setEnteredCash}
                layout="decimal"
                label="Opening cash in drawer"
                onClose={() => setFocused('')}
            />}
            {focusedCustom && !hasKeyboard && <TouchKeyboard
                open
                value={custom[focusedCustom]}
                onChange={fillCustom}
                layout={['price', 'stock', 'vStock', 'vPrice'].includes(focusedCustom) ? 'decimal' : 'text'}
                label={{ name: 'Product name', price: 'Price', stock: 'Stock', barcode: 'Barcode', vStock: 'Weight', vPrice: 'Price' }[focusedCustom] ?? focusedCustom}
                onClose={() => setFocusedCustom('')}
            />}
        </>
    )
}

export default memo(POS)