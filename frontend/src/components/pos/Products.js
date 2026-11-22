import labelImg from '../../asset/images/default.png';
import { dealHost } from '../../helpers/utils';
import { categoryAccent } from '../../helpers/categoryColors';
import './ProductTiles.css';

const hasImage = (image) => Boolean(image) && image !== 'null' && image !== 'undefined';

const toAmount = (value) => {
    const n = parseFloat(String(value ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

const formatQty = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

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
    catColors,
    currency = '€',
    offerBadges = new Map()
}) {
    const handleImgError = e => { e.target.onerror = null; e.target.src = labelImg; };
    const colClass = `col-md-${chunkSize === 6 ? '2' : '3'}`;
    // The first two categories always showed pictures (produce picked by photo); keep that,
    // but only when the product really has a photo.
    const pictureCategories = [categories?.[0]?.id, categories?.[1]?.id].filter(id => id !== undefined);

    return (
    <div className="contents pos-tiles">
        {
            Other && (<div className='row mt-3'>
                <div className={`${colClass} also`} onClick={() => toggleModal(!otherOpen)}>
                    <div className='pos-tile is-add'>
                        <span className='fa fa-plus' />
                        <span>Add new</span>
                    </div>
                </div>
            </div>)
        }
        { products.map((row, k) => (<div className='row mt-3' key={k}>
                {row.map((product, i) => {
                    const left = toAmount(product.quantity) - toAmount(cartStocks[product.id]);
                    // Same rule as before the redesign (an unknown cart count never means "out").
                    const stockOut = isInventory && (
                        (cartStocks[product.id] !== undefined && left === 0)
                        || (product.stock !== undefined && toAmount(product.quantity) - toAmount(product.stock) === 0)
                        || parseInt(product.quantity) === 0);
                    const showImage = hasImage(product.image) && (displayImage || pictureCategories.includes(product.category_id));
                    const price = toAmount(product.price);
                    const tax = product.tax && product.tax !== 'null' ? String(product.tax).trim() : '';
                    const name = String(product.name ?? '');
                    return (
                    <div key={i}
                        className={`${colClass} also ${stockOut ? 'stock-out' : ''}`}
                        onClick={() => addToCart(product.id)}
                        data-id={product.id}
                    >
                        <div className='pos-tile' title={name}
                            style={{ '--tile-accent': categoryAccent(product.category_id, catColors[product.category_id]) }}>
                            { offerBadges.has(product.id) && <span className='offer-badge' title={offerBadges.get(product.id)}>{offerBadges.get(product.id)}</span> }
                            { showImage &&
                                <div className='pos-tile-img'>
                                    <img src={dealHost(product.image)} onError={handleImgError} alt='' />
                                </div>
                            }
                            <div className='pos-tile-body'>
                                <strong className={`pos-tile-name ${name.length > 30 ? 'is-long' : ''}`}>{name}</strong>
                                <div className='pos-tile-meta'>
                                    <span className={`pos-tile-price ${price ? '' : 'is-open'}`}>
                                        {`${currency} ${price.toFixed(2)}`}
                                    </span>
                                    <span className='pos-tile-chips'>
                                        { isInventory &&
                                            <span className={`pos-tile-chip ${left <= 5 ? 'is-low' : ''}`} title='In stock'>
                                                {formatQty(left)}
                                            </span> }
                                        { tax && <span className='pos-tile-chip' title='Tax'>{tax}</span> }
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>))
        }
    </div>
    )
}

export default Products
