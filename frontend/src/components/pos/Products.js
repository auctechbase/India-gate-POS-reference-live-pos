import labelImg from '../../asset/images/default.png';
import { dealHost, hexToRgb, isColorDark, wrapText } from '../../helpers/utils';
import addNew from '../../asset/images/image.png';

function Products({
    products,
    addToCart,
    cartStocks,
    categories,
    displayImage,
    Other,
    chunkSize,
    toggleModal,
    otherOpen,
    isInventory,
    catColors
}) {

    const handleImgError = e => e.target.src = labelImg;
    function isFloat(n) {
        return n === +n && n !== (n|0);
    }
    const float = (n,d) => {
        return parseFloat(n).toFixed(d)
    }
    return (
    <div className="contents">
        {
            Other && (<div className='row mt-3' >
                <div className={`col-md-${chunkSize===3?'4':'3'} also`} onClick={()=>toggleModal(!otherOpen)}>
                    <div className='cell'>
                        <div className='w-100'>
                            <img className='title-img' src={addNew} alt={"Other"}/>
                        </div>
                        <div className='w-100' style={{color:'black', background:'lightgray'}}>
                            <strong className='wrapped-text'>
                                Add New &nbsp;
                                <span className='fa fa-plus fs-5' />
                            </strong>
                        </div>
                    </div>
                </div>
            </div>)
        }
        { products.map( (row, k) => (<div className={'row mt-3'} key={k}>
                {row.map((product,i ) => (
                    <div key={i} 
                        className={`col-md-${chunkSize===6?'2':'3'} also ${((product.quantity - product.stock)=== 0 || product.quantity - cartStocks[product.id] === 0 || parseInt(product.quantity)=== 0) && isInventory ? 'stock-out':''}`}  
                        onClick={()=>addToCart(product.id)} 
                        data-id={product.id}
                    >
                        <div className='cell' 
                            style={{minHeight:80}}
                        >
                            {
                                (displayImage || [categories[0].id, categories[1]?.id??0].includes(product.category_id) ) &&
                                <div className='w-100'>
                                    <img className='title-img' src={dealHost(product.image??labelImg)} onError={handleImgError} alt={product.name}/>
                                </div>
                            }
                            <div className={'w-100'} style={{ minHeight: !displayImage && product.category_id !== categories[0].id && 'inherit', color:isColorDark(hexToRgb(catColors[product.category_id]))? 'white':'black', background:catColors[product.category_id]}} >
                                <strong 
                                    className='wrapped-text' 
                                    style={{alignContent:'center',fontSize:product.name.length > 18 ? '1rem':'1.15rem'}} 
                                >
                                    { wrapText(product.name, 100) }
                                    { product.name.length > 100 && <span className='tooltiptext'>{product.name}</span> }
                                </strong>
                            </div>
                        </div>
                        <div className='extras'>
                            <div className='tax d-flex'>
                                <p style={{paddingRight:'3px'}}> Tax: </p>
                                <div style={{fontSize:'1rem', width:50}}>{product.tax??'0 %'}</div>
                            </div>
                            { isInventory && <div className='stock'>
                                <p>Items : </p>
                                <div style={{fontSize:'1rem'}}>
                                    { isFloat(product.quantity - (cartStocks[product.id]?? 0)) ? 
                                        float(product.quantity - (cartStocks[product.id]?? 0), 2) 
                                    : product.quantity - (cartStocks[product.id]?? 0) }</div>
                            </div>}
                        </div>
                    </div>
                ))}
            </div>))
        }
        
    </div>
    )
}

export default Products