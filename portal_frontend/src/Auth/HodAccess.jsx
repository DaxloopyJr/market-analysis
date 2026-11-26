/** HOD-only UI guard; Laravel still enforces reviewer assignment and scope. */
import {Navigate,useOutletContext} from 'react-router-dom';
import {isHodReviewer} from '../utils/hodReviewRules';
export default function HodAccess({children}) {
  const {user}=useOutletContext();
  return isHodReviewer(user)?children:<Navigate to="/dashboard" replace/>;
}
