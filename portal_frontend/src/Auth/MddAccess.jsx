/** MDD navigation guard. The Laravel API owns the actual ministry-wide scope. */
import {Navigate,useOutletContext} from 'react-router-dom';
import {isMddDirector} from '../utils/mddApprovalRules.js';
export default function MddAccess({children}){
  const {user}=useOutletContext();
  return isMddDirector(user)?children:<Navigate to="/dashboard" replace/>;
}
