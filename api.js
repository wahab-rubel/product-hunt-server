export const getUserSubscriptionStatus = async (email) => {
 try {
   const response = await fetch(`/api/subscription-status?email=${email}`);
   const data = await response.json();
   return data.isSubscribed;
 } catch (error) {
   console.error("Error fetching subscription status:", error);
   return false;
 }
};

export const initiatePayment = async (email, amount) => {
 try {
   const response = await fetch("/api/initiate-payment", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ email, amount }),
   });
   const data = await response.json();
   return data.success;
 } catch (error) {
   console.error("Payment error:", error);
   return false;
 }
};
