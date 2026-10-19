import React, { useEffect, useRef, useState } from "react";
import TouchKeyboard from '../common/TouchKeyboard';
import $ from "jquery";
import { useDispatch, useSelector } from "react-redux";
import { Form, Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap'
import { commonApiSlice,useGetProductCategoriesQuery, useGetProductsQuery, useGetTaxesQuery } from "../../features/centerSlice";
import { dealHost, Warning, wrapText } from "../../helpers/utils";
import toast, { LoaderIcon } from "react-hot-toast";
import axios from "axios";
import { preview } from "../../helpers/attachments";
import labelImg from "../../asset/images/default.png";
import { useSearch } from '../../contexts/SearchContext'
import SearchBoard from "../pos/SearchBoard";
import 'select2';
import 'select2/dist/css/select2.min.css';
let listTable
let deleting = false;
let copyRowData=[]
const Products = () => {
    useEffect(()=>{
        deleting=false
    },[])
    const listtableRef = useRef();
    const tableRef = useRef();
    const selectRef = useRef();
    const keyboardRef = useRef();
    const dispatch = useDispatch()

    const {data:categories, isSuccess:catSuccess} = useGetProductCategoriesQuery();
    const {data:taxess, isSuccess:taxAaGaya} = useGetTaxesQuery();
    const { searchQuery, setSearchQuery ,focused, setFocused} = useSearch()
    const [ focusedField, setFocusedField ] = useState(null)
    const [ rowData, setRowData ] = useState([]);
    const {currency, hasKeyboard, appKey } = useSelector( state=> state.auth );
    const [modal, setModal ] = useState(false);
    const { data, isSuccess, isLoading } = useGetProductsQuery();
    let [ editingProduct, setEditingProduct ] = useState({});
    const [ loading, setLoading ] = useState(isLoading)
    const [ cats, setCats ] = useState([]);
    const [ taxes, setTaxes ] = useState([]);
    const [ uploadedSrc, setPlaceholder ] = useState('');
    const [ view, setView] = useState('list');
    const changeProductField = e => setEditingProduct({ ...editingProduct, [e.target.name]: e.target.value });

    

    

    const onChange =  e => setEditingProduct({...editingProduct, [focusedField]:e})

    const handleFile = e => {
        let file = e.target.files[0];
        var reader = new FileReader();
        reader.readAsDataURL(file);
        setEditingProduct({ ...editingProduct, uploaded:file })
        reader.onload = function() {
            setPlaceholder(reader.result)
        }
    }

    const refer = e =>{ 
        let {img} = e.target.dataset;
        preview([img], img?.indexOf('https:')===-1)
    }
    const handleImgError = e => {
        e.target.src = labelImg
    }

    const handleProductUpdate = async(e) => {
        deleting=true; // just for prevent re-initiation of data-table
        e.preventDefault();
        let fd = new FormData();
        if(editingProduct.catName) {
            setEditingProduct({ ...editingProduct, category_id: cats.find(c => c.name === editingProduct['catName']).id })
        }
        for (const key in editingProduct) {
            if(key!=='catName') fd.append(key, editingProduct[key])
        }
        let cat = cats.find( c => c.id === parseInt(editingProduct?.category_id))?.name
        fd.append('catName', cat)
        fd.append('appKey', appKey)
        try {
            const {data} = await axios.post(`products/update`, fd, {
                headers: {
                    'Accept': 'application/json',
                    "Content-Type" : "multipart/form-data",
                    'pos-token' : localStorage.getItem('pos-token')
                }
            });
            if(data.status) {
                toast.success("Product updated!");
                console.log(data.updated)
                let updatedRow = [editingProduct.name, editingProduct.catName, currency+editingProduct.price, editingProduct.code ]
                $(`tr#${editingProduct.id} td`).each(function(k,v) {
                    if(k===1 && editingProduct.category_id) {
                        v.innerText = cats.find( c => c.id===parseInt(editingProduct.category_id)).name
                    } else if(updatedRow[k]){
                        v.innerText = updatedRow[k]
                    }
                })
                if(data.updated.image && (data.updated.image).indexOf('products')!==-1) {
                    deleting=false
                    setPlaceholder(null)
                }
                copyRowData = copyRowData.map( i => i.id===editingProduct.id ? editingProduct: i)
                dispatch(
                    commonApiSlice.util.updateQueryData('getProducts', undefined, (draft) => {
                        const {products} = draft
                        const {updated} = data;
                        const index = products.findIndex((item) => item.id === parseInt(updated.id))
                        if (index !== -1) {
                            draft['products'][index] = updated;
                            draft['products'][index]['catName'] = cats.find( c => c.id === updated.category_id)?.name;    
                        }
                    })
                ); 
                dispatch(
                    commonApiSlice.util.updateQueryData('getPosProducts', undefined, (draft) => {
                        const {products} = draft
                        const {updated} = data;
                        const index = products.findIndex((item) => item.id === parseInt(updated.id))
                        if (index !== -1) {
                            draft['products'][index] = updated;
                        }
                    })
                )
                if(!data.wasTrue) {
                    if(data.code==='ENOTFOUND') {
                        Warning("Not connected to internet!");
                    } else {
                        Warning("Product not updated on phone! Try syncing first with correct key");
                    }
                    dispatch({ type:"SET_APP_KEY", payload:"" })
                }
                setModal(false)
            } else {
                toast.error(data.message); 
            }
        } catch (error) {
            toast.error(`Exception`);
            console.log(error)
        }
        
    }
  
    const toggleModal = () => {
        setModal(!modal);
        setPlaceholder('')
        setFocusedField('')
    }
    const [preset, setPreset] = useState('');

    const edit = (e) => {
        let {id} = e.target.dataset;
        let product = copyRowData.find( item => item.id === parseInt(id))
        console.log(product)
        setEditingProduct(product);
        setModal(true)
    }

    const search = e => {
        setFocused(true);
        setSearchQuery(e.target.value)
    }

    async function removeProduct(e) {
        // return console.log(el.target)
        if(window.confirm("Are you sure")) {
            const {id} = e.target.dataset;
            try {
                deleting = true
                // await deleteProduct({id:id+"_"+appKey}).unwrap(); 
                const {data} = await axios.get(`/products/remove/${id+'_'+appKey}`); 
                if(data.status) {
                    const row = listTable.row(`#${id}`)
                    if(row.length) {
                        row.remove().draw(false)
                    }
                    if(data.disconnected) {
                        Warning("Product not deleted on phone due to internet!")
                    }
                    if(!data.data.status) {
                        toast("Product not removed from mobile, Since the application key is not registered! Sync the products to register!",
                            {
                                icon: '⚠️',
                                style: {
                                    borderRadius: '10px',
                                    background: '#333',
                                    color: '#fff',
                                },
                                duration: 9999
                            }
                        );
                    }
                    toast.success(data.message)
                } else {
                    toast.error(data.message)
                }

                setTimeout(()=> {
                    dispatch(
                        commonApiSlice.util.updateQueryData('getProducts', undefined, (draft) => {
                            let {products} = draft
                            if( products ) {
                                draft['products'] = products?.filter( product => product?.id !== parseInt(id) )
                            }
                        })
                    )
                    dispatch(
                        commonApiSlice.util.updateQueryData('getPosProducts', undefined, draft => {
                            let {products} = draft;
                            if(products) {
                                draft['products'] = products.filter( item => item.id!== parseInt(id))
                            }
                        })
                    )
                    dispatch({ type:"RESET_KART" })
                },800)
            } catch (error) {
                toast.error("Error removing product")
                console.log(error.message);
            }
        }
    }

    useEffect(() => {
        const handleDataReceived = (data) => console.log(data);
        window.electronAPI?.onDataReceived(handleDataReceived);
    }, []);

    const labelStyle = {
        cursor: 'pointer',
        borderRadius: '10px',
        height: '145px',
        width: '145px'
    }

    useEffect(()=> {
        setLoading(loading)
    },[loading])

    useEffect(()=> {
        if(catSuccess){
            setCats(categories.categories)
        }
    },[catSuccess, categories])

    useEffect(()=> {
        if(taxAaGaya) setTaxes(taxess.taxes);
    },[taxess, taxAaGaya])

    useEffect(() => {
        if(rowData.length) {
            if(deleting) return console.log("not drawing")
            $(tableRef.current).DataTable({
              data: rowData,
              columns: [
                { 
                    title: "",
                    render: (data, type, row) => {
                        return `<div class="card-body d-flex grid-view w-100">
                            <div class="col-9 d-block" >
                                <div class="row">
                                    <strong class="wrapped-text">${wrapText(row.name, 50)}<span class="${row.name?.length > 28? 'tooltiptext':`d-none`}">${row.name}</span></strong>
                                </div>
                                <div class="row mt-2" >
                                    <p> Price: ${currency+' '+row?.price}
                                        <button class="btn btn-sm ms-2 bcode" style="border:1px solid gray" data-code="${row.code}" data-name="${row.name}" data-price="${row.price}">
                                            <i class="fa-solid fa-barcode" style="font-size:1rem"></i>    
                                        </button>
                                    </p>
                                </div> 
                            </div>
                            <div class="col-3 text-center position-relative">
                                <img src="${dealHost(row.image??labelImg)}"  alt=''/>
                                <div class='image-container d-none' style="background-image:url(${dealHost(row.image??labelImg)}); background-size:cover;background-repeat:no-repeat" />
                                
                            </div>
                        </div>`
                    }
                }, 
                { 
                    title: "",
                    render: (data, type, row) => {
                        return `<div class="card-body d-flex grid-view w-100">
                            <div class="col-9 d-block" >
                                <div class="row">
                                    <strong class="wrapped-text">${wrapText(row.name, 50)}<span class="${row.name.length > 28? 'tooltiptext':`d-none`}">${row.name}</span></strong>
                                </div>
                                <div class="row mt-2" >
                                    <p> Price: ${currency+' '+row.price}
                                        <button class="btn btn-sm ms-2 bcode" style="border:1px solid gray" data-code="${row.code}" data-name="${row.name}" data-price="${row.price}">
                                            <i class="fa-solid fa-barcode" style="font-size:1rem"></i>    
                                        </button>
                                    </p>
                                </div> 
                            </div>
                            <div class="col-3 text-center position-relative">
                                <img src="${dealHost(row.image??labelImg)}" onerror="this.src='${labelImg}'" alt=''/>
                                <div class='image-container d-none' style="background-image:url(${dealHost(row.image)}); background-size:cover;background-repeat:no-repeat" />
                                
                            </div>
                        </div>`
                    }
                }, 
                { 
                    title: "",
                    render: (data, type, row) => {
                        return `<div class="card-body d-flex grid-view w-100">
                            <div class="col-9 d-block" >
                                <div class="row">
                                    <strong class="wrapped-text">${wrapText(row.name, 50)}<span class="${row.name.length > 28? 'tooltiptext':`d-none`}">${row.name}</span></strong>
                                </div>
                                <div class="row mt-2" >
                                    <p> Price: ${currency+' '+row.price}
                                        <button class="btn btn-sm ms-2 bcode" style="border:1px solid gray" data-code="${row.code}" data-name="${row.name}" data-price="${row.price}">
                                            <i class="fa-solid fa-barcode" style="font-size:1rem"></i>
                                        </button>
                                    </p>
                                </div> 
                            </div>
                            <div class="col-3 text-center position-relative">
                                <img src="${dealHost(row.image??labelImg)}" onerror="this.src='${labelImg}'" alt=''/>
                                <div class='image-container d-none' style="background-image:url(${dealHost(row.image??labelImg)}); background-size:cover;background-repeat:no-repeat" />
                            </div>
                        </div>`
                    }
                }
              ],
              searching: true,
              info: true,
              processing:true,
              ordering: true,
              lengthMenu:[ 10,25,50]
            });
            $(tableRef.current).on('click', '.image-container', e => refer(e))
            $(tableRef.current).on('click', '.bcode.btn', e => printBarcode(e.target.dataset))
            $(tableRef.current).on('click', '.dt-layout-table', () => setFocused(''))
        }
        $.fn.DataTable.ext.errMode = 'none';
        return () => {
            if(!deleting) {
                $(tableRef.current).off('click', '.image-container')
                $(tableRef.current).off('click', '.bcode.btn')
                $(tableRef.current).DataTable().destroy();}
            }

    }, [view, rowData]);

    useEffect(() => {

        if(rowData.length) {
            if(rowData.length===0) return
            if(deleting) return
            $(listtableRef.current).DataTable().destroy();
            listTable = $(listtableRef.current).DataTable({
                data: rowData,
                columns: [
                    { data: "name", title: "Name" },
                    { data: "catName", title: "Category" },
                    { 
                        data: null, 
                        title: "Price",
                        render: (data,type, row) => {
                            return `${currency} ${row.price}`
                        }
                    },
                    { data: "code", title: "Barcode" },
                    {   
                        data: null, 
                        title: "Description",
                        render: (data, type, row) => `
                            <p class="wrapped-text">
                                ${wrapText(row.sales_desc??'', 45)}
                                ${row.sales_desc?.length > 45? `<span class="tooltiptext">${row.sales_desc}</span>`:''}
                            </p>
                        `
                    },
                    {   
                        data: null,
                        title: "Image",
                        render: (data, type, row) => `<div class="position-relative img">
                                <img 
                                    class='img-fluid img-thumbnail'
                                    src="${dealHost(row.image??labelImg)}"
                                    alt=''
                                    data-img="${row.image}"
                                    onerror="this.src='${labelImg}'"
                                />
                            </div>`,
                    },
                    {
                      data: null, // No direct data, render custom content
                      title: "Actions",
                      
                      render: (data, type, row) => {
                        return `
                          <button class="edit-list btn btn-success btn-sm btn-rounded" data-id="${row.id}">Edit</button>
                          ${row.code ? `<button class="barcode-list btn btn-success btn-sm btn-rounded" data-code="${row.code}" data-name="${row.name}" data-price="${row.price}">Barcode</button>`:''}
                          <button class="delete-list btn btn-danger btn-sm btn-rounded" data-id="${row.id}">Delete</button>
                        `}
                    },
                ],
                rowCallback: function (row, data) {
                    $(row).addClass(data.id+'_')
                },
                searching: true,
                info: true,
                order:[],
                ordering: true,
                deferRender:true,
                lengthMenu:[ 15,25,50],
                rowId: "id"
            });

            $(listtableRef.current).on('click', '.edit-list.btn', e => edit(e))
            $(listtableRef.current).on('click', '.barcode-list.btn', e => printBarcode(e.target.dataset))
            $(listtableRef.current).on('click', '.delete-list.btn', e => removeProduct(e))
            $(listtableRef.current).on('click', '.img-thumbnail', e => refer(e))
            $(listtableRef.current).on('keyup', 'input[type="search"]', e => search(e))
            $('.dt-input').on('click', ()=> setFocused(true))
            $('table').on('click', () => setFocused(false))
        }
        $.fn.DataTable.ext.errMode = 'none';
        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
            const nameFilter = $('select[name=cats]').val();
            const name = data[1]; // column 0 = Category

            if (!nameFilter || name === nameFilter) {
                return true;
            }
            return false;
        });

        $('select[name=cats]').select2()
        $('select[name=cats]').on('change', function(){
            listTable.draw()
        })

        return () => {
            if(!deleting) {
                $('.dt-input').on('click', ()=> setFocused(false))
                $(listtableRef.current).off('click', '.barcode-list.btn');
                $(listtableRef.current).off('click', '.delete-list.btn');
                $(listtableRef.current).off('click', '.img-thumbnail');
                $(listtableRef?.current).DataTable().destroy();
                $.fn.dataTable.ext.search.pop();
            }
        }

    }, [view, rowData]);

    useEffect(()=>{
        $('.dt-input').val(searchQuery).trigger('keyup')
        return () => setSearchQuery('')
    },[searchQuery])

    useEffect(()=> {
        keyboardRef.current?.setInput(preset)
    },[preset])

    const handleView = view => {
        deleting = false
        if(view==='grid') {
            $(listtableRef.current).DataTable().destroy();
        } else {
            $(tableRef.current).DataTable().destroy();
        }
        setView(view)
    }

    const printBarcode = dataset => {
        if(window.electronAPI) {
            window.electronAPI.generateBarcode(dataset)
        } else {
            Warning("Connect to a printer first!")
        }
    }
   
    useEffect(()=> {
        if(isSuccess)
        { 
            setRowData(data.products)
            let prs=[]
            data.products.forEach( item => {
                if(!item.code && prs.indexOf(item.name.trim())!== -1) {
                    console.log("ye duplicate hai "+ item.name)
                } else {
                    if(!item.code) {
                        prs.push(item.name);
                    }
                }
            })
            copyRowData = data.products
        }
        return ()=> setRowData([])
    },[isSuccess, data])
  
    return (
        <> 
        <div className="row w-100 h-100 mt-4"> 
            <div className="col-lg-12 grid-margin stretch-card"> 
                <div className="card">
                    <div className="card-header" >
                        <div className="flex-end d-flex w-100" style={{justifyContent:'space-between'}}>
                            <div className="d-flex" style={{width:'140px',justifyContent:'space-around',alignItems:'center'}}>
                                <button type="button" className={`btn btn-outline-light btn-sm`} style={{ backgroundColor:view==='grid' && '#55aaad', color: view=== 'grid' && '#fff' }} onClick={()=>handleView('grid')} > Grid </button>
                                <button type="button" className={`btn btn-outline-light btn-sm`} style={{ backgroundColor:view==='list' && '#55aaad',color: view=== 'list' &&'#fff' }} onClick={()=>handleView('list')} > List </button>
                            </div>
                            <div>
                                <select name="cats">
                                    <option value="">Filter by Category</option>
                                    <option value="">Reset</option>
                                    {cats.map( a => <option>{a.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="card-body table-responsive">
                        {view==='list' && <table className='table' ref={listtableRef} />}
                        {view === 'grid' && <table ref={tableRef} className='table grid-view' />}
                        { loading ? <LoaderIcon /> : (rowData.length === 0 ? <h3>No products yet..</h3>: null )  }
                    </div>
                   
                    <Modal isOpen={modal} toggle={toggleModal} className="modal-md" style={{padding:0}}> 
                        <Form onSubmit={handleProductUpdate} id="updateForm">
                            <ModalHeader > Update Product </ModalHeader>
                                <ModalBody >
                                    <div className="col-md-12 d-flex justify-content-center">
                                        <div className="col-md-6">
                                            <div className="row mt-2">
                                                <div className="col-4 align-self-center">
                                                    <label htmlFor="name">Name</label>
                                                </div>
                                                <div className="col-8">
                                                    <input type="text" id="name" name="name" className="form-control" onChange={changeProductField} 
                                                    value={editingProduct.name} onClick={()=>{setFocusedField('name');setPreset(editingProduct.name)}}/>
                                                </div>
                                            </div>
                                            <div className="row mt-2">
                                                <div className="col-4 align-self-center">
                                                    <label htmlFor="price">Price</label>
                                                </div>
                                                <div className="col-8">
                                                    <input type="text" id="price" name="price" pattern="^\d+(\.\d+)?$" title="price should be in numbers" className="form-control" value={ editingProduct.price } onChange={changeProductField} 
                                                    placeholder={currency}
                                                    onClick={()=>{setFocusedField('price');setPreset(editingProduct.price)}}
                                                    />
                                                </div>
                                            </div>
                                            <div className="row mt-2">
                                                <div className="col-4 align-self-center">
                                                    <label htmlFor="barcode"> Barcode </label>
                                                </div>
                                                <div className="col-8">
                                                    <input type="text" name="code" value={editingProduct.code} 
                                                        onChange={changeProductField} 
                                                        className="form-control" 
                                                        id="barcode" 
                                                        onClick={()=>{setFocusedField('code');setPreset(editingProduct.code)}}
                                                    />
                                                </div>
                                            </div>
                                            <div className="row mt-2">
                                                <div className="col-4 align-self-center">
                                                    <label htmlFor="tax">Tax</label>
                                                </div>
                                                <div className="col-8">
                                                    <select name="tax" ref={selectRef} className="form-control select2" id="tax" onChange={changeProductField}>
                                                        <option value={''}>Choose</option>
                                                        {taxes.map( tax => <option key={tax.id} selected={(tax.amount+tax.name)?.trim()===(editingProduct.tax)?.trim()} value={tax.amount+' '+tax.name}>{tax.amount+' '+tax.name}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="row mt-2">
                                                <div className="col-4 align-self-center">
                                                    <label htmlFor="category">Category</label>
                                                </div>
                                                <div className="col-8">
                                                    <select name="category_id" className="form-control select2" id="category" onChange={changeProductField}>
                                                        {cats.map( cat => <option key={cat.id} value={cat.id} selected={cat.name===editingProduct.catName}> {cat.name} </option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-md-4 offset-1 align-content-center">
                                            <div className="row mt-2">
                                                <div className="form-group position-relative img">
                                                    <h5> Update Image </h5>
                                                    <label htmlFor="image">
                                                        <img 
                                                            src={ uploadedSrc ? uploadedSrc :dealHost(editingProduct.image?? labelImg)} 
                                                            alt=""
                                                            onError={handleImgError} 
                                                            style={labelStyle}  
                                                        />
                                                    </label>
                                                    <input name="image" type="file" id="image" className="d-none" onChange={handleFile} accept="image/*" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </ModalBody>
                            <ModalFooter>
                                <button className="btn btn-light btn-rounded" type="button" onClick={toggleModal}>
                                    Close
                                </button>
                                <button className="btn btn-success btn-rounded"> Update </button>
                            </ModalFooter> 
                        </Form>
                    </Modal>
                    {focusedField && !hasKeyboard && <TouchKeyboard
                        open
                        value={editingProduct[focusedField]}
                        onChange={onChange}
                        layout={focusedField === 'price' ? 'decimal' : 'text'}
                        label={{ name: 'Product name', price: 'Price', code: 'Barcode' }[focusedField] ?? focusedField}
                        onClose={() => setFocusedField('')}
                    />}
                </div>
            </div>
        </div>
        {focused && !hasKeyboard && <SearchBoard />}
        </>
    );
};

export default Products
