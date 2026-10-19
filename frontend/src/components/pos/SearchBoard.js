import { useSelector } from 'react-redux';
import { useSearch } from '../../contexts/SearchContext';
import TouchKeyboard from '../common/TouchKeyboard';

// On-screen keyboard for the product search box (POS, Products, Inventory).
export default function SearchBoard() {
    const { searchQuery, setSearchQuery, setFocused } = useSearch();
    const { hasKeyboard } = useSelector(s => s.auth);
    if (hasKeyboard) return null;
    return (
        <TouchKeyboard
            open
            value={searchQuery}
            onChange={setSearchQuery}
            label="Search products"
            onClose={() => setFocused(false)}
        />
    );
}
