
import { toast } from "react-toastify";
import Swal from "sweetalert2";

export const notify = {
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
  warning: (message) => toast.warning(message),
  info: (message) => toast.info(message),

  confirm: async (message) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: message,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, proceed",
      cancelButtonText: "Cancel",
    });

    return result.isConfirmed;
  },
};
