import React, { memo, useState } from 'react'
import { hexToRgb, isColorDark } from '../../helpers/utils'
import { useSelector } from 'react-redux'

function Category({categories, products, withAll, cRef, filter, handleDragStart, handleDragOver, handleDrop, scrollTop }) {
    const fs2 = {fontSize: '2rem'}
    const {theme} = useSelector(state => state.auth)
    const [ currentCat, setCurrent ] = useState(0);
    return (
        <div className="position-fixed" style={{backgroundColor: theme ==='default'?'#a0bfcf':'whitesmoke',minHeight:70, width:'-webkit-fill-available',zIndex:100,marginTop:-1}}>
            <div className={`category row ms-5`} style={{flexWrap:'nowrap'}} ref={cRef}>
                { categories.map((Cat,i) => ( withAll===false ? (products.findIndex( a => a.category_id===parseInt(Cat.id))!==-1) : true ) && (
                    <div key={i} 
                        className={`category-item ${i===currentCat?'active':''}`} 
                        style={{color:isColorDark(hexToRgb(Cat.color))? 'white':'black',background:Cat.color,minWidth:'150px'}} 
                        onClick={()=>{filter(Cat.id);setCurrent(i)}}
                        draggable={true}
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={e => handleDragOver(e,i)}
                        onDrop={handleDrop}
                    >
                        {(Cat.name).includes('/') ? (Cat.name).split('/')[1]: Cat.name }
                    </div>
                    ))
                }
                <div className='category-item' onClick={()=> filter(null)} style={{background:"azure", width:200, marginRight:80}}>
                    Other 
                </div>
                <div className='position-fixed t-scroller' style={{bottom:40,right:40}} onClick={scrollTop}>
                    <button className='btn btn-rounded bg-white' style={{border:"2px dashed"}}>
                        <i className='fa fa-arrow-up'/>
                    </button>
                </div>
            </div>
            <button className={`btn prev position-relative`} style={{top:5,zIndex:2,left:-30}} onClick={()=> cRef.current.scrollBy({left:-200, behavior:'smooth'})}>
                <i style={fs2} className="fa-solid fa-circle-chevron-left text-dark"/>
            </button>
            <button className="btn next position-absolute" style={{right:-10,top:5,zIndex:2 }} onClick={()=>cRef.current.scrollBy({left:200, behavior:'smooth'})}>
                <i style={fs2} className="fa-solid fa-circle-chevron-right text-dark" />
            </button>
        </div>
    )
}

export default memo(Category)