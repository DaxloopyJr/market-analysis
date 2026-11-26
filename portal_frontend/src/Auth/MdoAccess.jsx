/** Client navigation guard only; Laravel validates every cross-institution read/action. */
import {Navigate,useOutletContext} from 'react-router-dom';
import {isMdoReviewer} from '../utils/mdoReviewRules';
export default function MdoAccess({children}){
  const {user}=useOutletContext();
  return isMdoReviewer(user)?children:<Navigate to="/dashboard" replace/>;
}
