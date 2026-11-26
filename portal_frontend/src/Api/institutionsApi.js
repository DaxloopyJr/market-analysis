
import api from "./Api";

export const getInstitutions = async (page = 1) => {
  console.log("Sending institutions GET request");

  const response = await api.get("/institutions", {
    params: { page },
  });

  console.log("Institutions HTTP status:", response.status);

  return response.data;
};
