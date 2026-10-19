import axios from 'axios';
import Keyboard from 'react-simple-keyboard';
import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom'
import { Modal, ModalFooter, ModalHeader, Form, ModalBody, Row, Container, FormGroup, Label, Input } from 'reactstrap'
import { commonApiSlice, useGetListCategoriesQuery, useGetProductCategoriesQuery, useGetTaxesQuery, useToggleCategoryMutation, useToggleTaxMutation } from '../../features/centerSlice';
import toast from 'react-hot-toast';

function CategoryAndTax() {
    const {type} = useParams()
    const dispatch = useDispatch();
    const keyboardRef = useRef();
    const [ layoutName, setLayout ] = useState('default')
    const [ focused, setFocused ] = useState(false);
    const [ currentIndex, setCurrentIndex ] = useState(null)
    const { hasKeyboard } = useSelector(s => s.auth)
    const { data:original, isSuccess, refetch } = useGetListCategoriesQuery();
    const { refetch:reload } = useGetProductCategoriesQuery()
    const { data:dbTaxes, isSuccess:taxLoaded, refetch: refetchTax } = useGetTaxesQuery()
    const [ toggleCategory ] = useToggleCategoryMutation();
    const [ toggleTax ] = useToggleTaxMutation();
    const [categories, setCategories] = useState([]);
    const [editing, setEditing] = useState(false);
    const [editingTax, setTaxEditing] = useState(false);
    const containerRef = useRef(null);
    const [taxes, setTaxes] = useState([]);

    const [catFields, setCatField] = useState({})

    const [justifyActive, setJustifyActive] = useState(type);
    const handleJustifyClick = value => {
        if (value === justifyActive) {
            return;
        } 
        setJustifyActive(value);
    };
    const [open, setModal] = useState(false);

    const changeTax = e => {
        const {index} = e.target.dataset;
        setTaxes(
            taxes.map( (t, i)=> 
                i=== parseInt(index) ? {...t, [e.target.name]: e.target.value}: t
            )
        ) 
    }

    const editTax = (tID) => setTaxEditing(tID)

    const toggleModal = () => setModal(!open)
    const catChange = (e) => setCatField({ ...catFields, [e.target.name]:e.target.value })

    const initTax = () => {
        setTaxes([...taxes, {name:'', amount:'', status:true}]);
        if(containerRef.current) {
            // containerRef.current.scrollTop = containerRef.current.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
        }
    }

    const initCategory = () => {
        setCategories([...categories, { name:'', color:'', status: true }]); 
        if(containerRef.current) {
            // containerRef.current.scrollTop = containerRef.current.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
        } 
    }

    const createCategory = e => {
 
        dispatch({type:"LOADING"});
        const payload = categories[categories.length-1]; // the last one is the item to be saved
        axios.post(`category/create`, payload ).then(({data})=> {
            if(data.status) {
                toast.success(`Category added successfully!`);
                refetch();
                setFocused('')
            }
        }).catch(()=>{})
        .finally(()=> dispatch({type:"STOP_LOADING"}));

    }

    const deleteCategory = (id,event) => {
        const {index} = event.target.dataset
        setFocused(null)
        if(!id) {
            return setCategories(categories.filter( (cat, ind)=> ind !== parseInt(index)))
        }
        if(!window.confirm('Are you sure? Products associated with this category will also be deleted!')) {
            return 
        }
        dispatch({ type:"LOADING" });
        axios.get(`category/remove/${id}`).then(({data})=> {
            
            if(data.status) {
                setCategories(categories.filter( (cat, ind)=> ind !== parseInt(index)))
                toast.success("Category removed!");
                dispatch(
                    commonApiSlice.util.updateQueryData('getPosProducts', undefined, draft => draft.products.filter(pr => pr.category_id !== parseInt(id)))
                )
                dispatch(
                    commonApiSlice.util.updateQueryData('getProducts', undefined, cache => cache.products.filter( pr=> pr.catName !== categories[index].name ))
                )
            } else {
                toast.error("Couldn't remove category!");
            }
        }).catch(()=> null )
        .finally(()=> dispatch({ type:"STOP_LOADING" }))
    }

    const createTax = e => {
        setFocused(null)
        dispatch({type:"LOADING"});
        const tax = taxes[taxes.length-1];
        axios.post(`tax/create`, tax ).then(({data})=> {
            if(data.status) {
                toast.success("Tax successfully added!");
                refetchTax()
            } else {
                toast.error("Something went wrong!");
            }
        }).catch(()=> toast.error("Something went wrong!"))
        .finally(()=> dispatch({type:"STOP_LOADING"}));

    }

    const deleteTax = (id,event) => {
        const {index} = event.target.dataset
        if(!id) {
            return setTaxes(taxes.filter( (cat, ind)=> ind !== parseInt(index)))
        }
        if(!window.confirm('Are you sure?')) {
            return 
        }
        dispatch({ type:"LOADING" });
        axios.get(`tax/remove/${id}`).then(({data})=> {
            if(data.status) {
                setTaxes(taxes.filter( (cat, ind)=> ind !== parseInt(index)))
                toast.success("Tax removed!");
            } else {
                toast.error("Couldn't remove tax!");
            }
            dispatch(
                commonApiSlice.util.updateQueryData('getTaxes', undefined, cache => cache.taxes.filter( t => t.id !== parseInt(id)))
            )
        }).catch(()=> null )
        .finally(()=> dispatch({ type:"STOP_LOADING" }))
    }

    const edit = (id) => setEditing(id)

    const save = id => {
        const cat = categories.find( ite => ite.id === id);
        axios.post('category/update', cat).then(({data})=> {
            if(data.status) {
                toast.success(data.message)
                setEditing('')
                setFocused(null)
                refetch()
            }
        }).catch().finally()
    }

    const saveTax = async id => {
        const tax = taxes.find( t => t.id === id );
        const {data} = await axios.post(`/tax/update`, tax);
        if(data.status) {
            refetchTax();
            toast.success("Tax successfully updated!");
            setTaxEditing(false)
        } else {
            toast.error("Failed to update tax, try creating new one deleting it.")
        }
        setFocused(null)
    } 

    const updateCategory = e => {
        let {index} = e.target.dataset; 
        setCategories(
            categories.map((item, i) =>
                i === parseInt(index) ? { ...item, [e.target.name]: e.target.value } : item
            )
        ) 
    }

    const setCategory = async e => {
        let {id, status} = e.target.dataset;
        let stat = parseInt(status) ? 0 : 1; 
        e.preventDefault();
        try {
            let res = await toggleCategory({id, status:stat}).unwrap()
            reload()
            refetch()
            if (res.status) e.target.checked = stat
        } catch (error) {
            console.log("Exception on first sight:- "+ error.message )
        }
    }

    const setTax = async e => {
        let {id, status} = e.target.dataset
        let stat = parseInt(status)? 0: 1
        e.preventDefault();
        try {
            let res = await toggleTax({id, status:stat}).unwrap()
            if(res.status) e.target.checked = stat
        } catch (error) {
            toast.error("Something went wrong!")
        }
    }

    useEffect(() => {
        if(isSuccess) {
            setCategories(original.categories);
        }
        return () => null
    },[ isSuccess,original ])

    useEffect(()=>{
        if(taxLoaded) {
            setTaxes(dbTaxes.taxes)
        }
        return ()=> null
    },[taxLoaded, dbTaxes])

    const [ editingType, setEditingType ] = useState(null)
    const [ position, setPosition ] = useState({ x: window.screen.availWidth/4, y: window.screen.availHeight / 2 });
    const [ dragging, setDragging ] = useState(false);
    const [ offset, setOffset ] = useState({ x: 0, y: 0 });
    const [ presetTxt, setPreset ] = useState('');
    const [ scale, setScale ] = useState(localStorage.getItem('_keyboard_scale')??1)
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
        if(editingType==='cat') {
            setCategories(
                categories.map((item, i) =>
                    i === parseInt(currentIndex) ? { ...item, [focused]: e } : item
                )
            )
        } else {
            setTaxes(
                taxes.map( (t, i)=> 
                    i=== parseInt(currentIndex) ? {...t, [focused]: e }: t
                )
            ) 
        }
    }
    useEffect(() => {
        keyboardRef.current?.setInput(presetTxt);
    }, [presetTxt]);

    const CategoryModal = () => {
        return <Modal isOpen={open} toggle={toggleModal} > 
            <Form onSubmit={createCategory} >
                <ModalHeader toggle={toggleModal}> Update Product </ModalHeader>
                    <ModalBody>
                        <Container>
                            <Row>
                                <FormGroup>
                                    <Label> Name </Label>
                                    <Input
                                        type={'text'}
                                        name='name'
                                        onChange={catChange}
                                    />
                                </FormGroup>
                            </Row>
                            <Row>
                                <FormGroup>
                                    <Label> Revised Photo </Label>
                                    <Input 
                                        name='color'
                                        type='color'
                                        onChange={catChange}
                                    />
                                </FormGroup>
                            </Row>
                            <Row>
                                <FormGroup>
                                    <Label> Status </Label>
                                    <Input 
                                        name='status'
                                        type='checkbox'
                                        onChange={catChange}
                                        defaultChecked={true}
                                    />
                                </FormGroup>
                            </Row>
                        </Container>
                    </ModalBody>
                <ModalFooter>
                    <button className="btn btn-primary" type="button" onClick={toggleModal}>
                        Close
                    </button>
                </ModalFooter> 
            </Form>
        </Modal>
    }
    
    return (
        <>
           <div className={`content-wrapper`} >
                <div className="d-grid" style={{overflowY:'auto'}} ref={containerRef}>
                    <div className="d-flex position-relative">
                        <button className="btn tablink" data-btn="category" 
                            onClick={() => handleJustifyClick('categories')} data-active={justifyActive==='categories'} style={{zIndex:8}}> Categories </button>
                        <button className="btn tablink" data-btn="tax" onClick={() => handleJustifyClick('taxes')}  data-active={justifyActive==='taxes'} 
                        style={{borderTopLeftRadius:'0px',borderBottomLeftRadius:'0px',zIndex:8}}>
                            Taxes 
                        </button>
                    </div>
                    <div id="category" className={`tabcontent ${ justifyActive==='categories' ?'d-block': 'd-none' }`}  ref={containerRef}>
                        <div className="col-lg-12 grid-margin stretch-card">
                            <div className="card">
                                <div className="card-body">
                                    <div className="table-responsive w-100 categoryTable">
                                        <table className='table table-bordered w-100'>
                                            <thead>
                                                <tr>
                                                    <th>S.No</th>
                                                    <th>Name</th>
                                                    <th>Color</th> 
                                                    <th>Status</th>
                                                    <th>
                                                        Action
                                                        <span className={`fa fa-plus btn-sm btn-rounded btn btn-success ms-4`} title="Create" onClick={initCategory}> New </span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                            { categories.map( (cat,i) => (
                                                <tr key={i}>
                                                    <td> {1 + i} </td>        
                                                    <td> <Input 
                                                        name='name' 
                                                        type='text' 
                                                        data-index={i} 
                                                        onChange={updateCategory} 
                                                        disabled={ cat.id && editing!==cat.id } 
                                                        value={cat.name}
                                                        onClick={(e)=> {
                                                            setFocused('name');
                                                            setEditingType('cat')
                                                            setPreset(cat.name)
                                                            setCurrentIndex(i)
                                                        }}
                                                    /> </td>
                                                    <td> <Input type='color' name='color' data-index={i} onChange={updateCategory} disabled={ cat.id && editing!==cat.id } defaultValue={cat.color} /> </td>        
                                                    <td>
                                                        <input type={`checkbox`} data-id={cat.id} data-status={cat.status} onChange={setCategory} id={`btn`+cat.id} name={'status'} defaultChecked={cat.status} className='status'/>
                                                        <label htmlFor={`btn`+cat.id}/>
                                                        <div className='plate'/>
                                                    </td>
                                                    <td>
                                                        { cat.id ? 
                                                        (<>
                                                        <button className={`btn btn-sm btn-primary ${editing===cat.id && 'btn-success'}`} onClick={()=> editing !== cat.id ? edit(cat.id): save(cat.id)}>
                                                            { editing && editing === cat.id ? 'Save':'Edit'}
                                                        </button>
                                                        <button data-index={i} className={`btn btn-sm btn-danger ms-3 delete`} onClick={e=> deleteCategory(cat.id, e)}>
                                                            Delete
                                                        </button>
                                                        </>):
                                                        <>
                                                        <button className='btn btn-sm btn-success' onClick={createCategory}>
                                                            Add
                                                        </button>
                                                        <button data-index={i} className={`btn btn-sm btn-light ms-3 delete`} onClick={e=> deleteCategory(cat.id, e)}>
                                                            Cancel
                                                        </button>
                                                        </>
                                                        }
                                                    </td>
                                                </tr>
                                            )) }
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="tax" className={`tabcontent ${ justifyActive ==='taxes' ? 'd-block': 'd-none' }`}>
                        <div className="col-lg-12 grid-margin stretch-card">
                            <div className="card">
                                <div className="card-body">
                                    <div className="table-responsive w-100 taxTable">
                                        <table className={`table table-bordered w-100`}>
                                            <thead>
                                                <tr>
                                                    <th>S.No</th>
                                                    <th>Name</th>
                                                    <th>Amount</th> 
                                                    <th>Status</th>
                                                    <th>
                                                        Action
                                                        <span className={`mdi mdi-plus btn-sm btn-rounded btn btn-success ms-4`} 
                                                        data-toggle="modal" data-target=".addTaxes" title="Create" onClick={initTax}> New </span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {taxes.map( (tax,i) => {
                                                    return <tr key={i}>
                                                        <td>{1+i}</td>
                                                        <td>
                                                            <Input data-index={i} 
                                                                name='name' 
                                                                value={tax.name} 
                                                                onChange={changeTax} 
                                                                disabled={ tax.id && editingTax!==tax.id }
                                                                className='input'
                                                                onClick={(e)=> {
                                                                    setFocused('name');
                                                                    setEditingType('ct')
                                                                    setPreset(tax.name)
                                                                    setCurrentIndex(i)
                                                                }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <Input 
                                                                data-index={i} 
                                                                name='amount' 
                                                                defaultValue={tax.amount} 
                                                                onChange={changeTax}
                                                                disabled={ tax.id && editingTax!==tax.id }
                                                                className='input'
                                                                onClick={(e)=> {
                                                                    setFocused('amount');
                                                                    setEditingType('ct')
                                                                    setPreset(tax.amount)
                                                                    setCurrentIndex(i)
                                                                }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input 
                                                                type={`checkbox`} 
                                                                style={{display:'none'}} 
                                                                id={`btn-tax`+tax.id} 
                                                                name={'status'} 
                                                                data-id={tax.id}
                                                                data-status={tax.status}
                                                                defaultChecked={tax.status} 
                                                                className='status' 
                                                                onChange={setTax}
                                                            />
                                                            <label htmlFor={`btn-tax`+tax.id} />
                                                            <div className='plate' />
                                                        </td>
                                                        <td>
                                                            {tax.id ? (
                                                            <>
                                                                <button className={`btn btn-sm btn-primary ${editingTax === tax.id && 'btn-success'}`} onClick={(e)=> {
                                                                    editingTax !== tax.id ? editTax(tax.id): saveTax(tax.id)
                                                                    }}> 
                                                                    { editingTax && editingTax === tax.id ? 'Save':'Edit'}    
                                                                </button>
                                                                <button className='btn btn-sm btn-rounded btn-danger ms-3' onClick={e => deleteTax(tax.id, e)} >Delete</button>
                                                            </>
                                                            ):(
                                                            <>
                                                                <button className='btn btn-sm btn-rounded btn-success' onClick={createTax}> Add </button>
                                                                <button className='btn btn-sm btn-rounded btn-light ms-3' onClick={e => deleteTax(tax.id, e)} >Cancel</button>
                                                            </>
                                                            )}
                                                        </td>
                                                    </tr>
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

           </div>
            <CategoryModal/>
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
                                touchAction: "none",
                                borderRadius: "8px 8px 0 0",
                            }}
                        >
                            Hold To Drag 
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
                                    default: focused==='amount' ? [
                                        "! @ # $ % ^ & * {bksp}",
                                        "1 2 3 4 5 6 7 8 9 0",
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
                                    "{bksp}":"Backspace",
                                    "{space}":"Space"
                                }}
                                layoutName={layoutName}
                            />
                        <div className='bg-white d-flex board-navs' style={{justifyContent:'space-between',padding:'5px 20px'}}>
                            <button className='btn btn-light btn-rounded' onClick={()=>{
                                // se({...inputFields,[focused]:''})
                                keyboardRef.current.clearInput()
                            }} style={{border:'1px solid gray'}}>CLEAR</button>
                            <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={() => setScale(prev => Math.max(prev - 0.1, 0.5))}>-</button>
                            <span style={{placeContent:'center'}}> Size: {Math.round(scale * 100)}% </span>
                            <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={() => setScale(prev => Math.min(prev + 0.1, 2))}>+</button>
                            <button onClick={()=>setFocused('')} className='btn btn-light btn-rounded' style={{border:'1px solid gray'}}>HIDE</button>
                        </div>
                    </div>
                </div>
            </div>
            }
        </>
    )
}

export default CategoryAndTax