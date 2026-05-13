"""Positive case: non-generative GET-shaped read SHOULD trigger the missing-guard finding."""
import stripe

def get_customer(customer_id: str):
    return stripe.Customer.retrieve(customer_id)
