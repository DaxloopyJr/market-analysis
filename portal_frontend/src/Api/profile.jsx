/** Confirmed Laravel endpoint for an authenticated active user. */
import api from "./axios";

export async function changeOwnPassword({currentPassword, newPassword, confirmation}) {
  const response = await api.post("/change-password", {
    current_password: currentPassword,
    password: newPassword,
    password_confirmation: confirmation,
  });
  return response.data;
}

export const PROFILE_PASSWORD_API_CONFIRMED = true;
