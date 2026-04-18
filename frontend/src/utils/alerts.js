import Swal from "sweetalert2";

const baseOptions = {
  confirmButtonColor: "#1E3A8A",
  heightAuto: false
};

const toastOptions = {
  ...baseOptions,
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  showCloseButton: true,
  timer: 3200,
  timerProgressBar: true,
  width: 320,
  padding: "0.65rem 0.8rem",
  customClass: {
    popup: "just-toast-popup",
    title: "just-toast-title",
    htmlContainer: "just-toast-text"          
  },
  didOpen: (toast) => {
    toast.addEventListener("mouseenter", Swal.stopTimer);
    toast.addEventListener("mouseleave", Swal.resumeTimer);
  }
};

function fireToast(options) {
  Swal.fire({
    ...toastOptions,
    ...options
  });

  
  return Promise.resolve();
}

export function showSuccess(title, text) {
  return fireToast({
    icon: "success",
    title,
    text
  });
}

export function showError(title, text) {
  return fireToast({
    icon: "error",
    timer: 4200,
    title,
    text
  });
}

export function showWarning(title, text) {
  return fireToast({
    icon: "warning",
    timer: 3800,
    title,
    text
  });
}

export function showConfirm({
  title,
  text,
  confirmText = "Yes",
  cancelText = "Cancel",
  confirmButtonColor = "#1E3A8A"
}) {
  return Swal.fire({
    ...baseOptions,
    icon: "question",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor
  });
}

export function formatValidationErrors(errors) {
  if (!errors || typeof errors !== "object") return "";

  return Object.values(errors)
    .flat()
    .filter(Boolean)
    .join("\n");
}
