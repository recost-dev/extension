/**
 * Mock API call fixtures for ReCost scanner testing.
 *
 * This file contains real SDK import and call patterns that the AST scanner
 * can detect. It is intentionally NOT meant to be executed — it exists purely
 * so the scanner can fire on realistic API usage patterns when the
 * "Include test & mock files" toggle is enabled.
 *
 * Patterns covered per provider:
 *   - N+1: API call inside an unbounded loop
 *   - Batching opportunity: sequential calls that could be parallelized
 *   - Missing cache: read-like call with no cache guard
 */

// ── OpenAI ────────────────────────────────────────────────────────────────────

import OpenAI from "openai";

const openaiClient = new OpenAI();

// N+1: embedding created per document inside an unbounded loop
async function embedDocumentsOneByOne(docs: string[]): Promise<void> {
  for (const doc of docs) {
    await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: doc,
    });
  }
}

// Batching opportunity: sequential chat completions that could use Promise.all
async function generateTwoCompletions(prompt1: string, prompt2: string): Promise<void> {
  const first = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt1 }],
  });
  const second = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt2 }],
  });
  console.log(first, second);
}

// Missing cache: completion called on hot path with no cache guard
async function handleUserRequest(userMessage: string): Promise<string> {
  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: userMessage }],
  });
  return response.choices[0]?.message.content ?? "";
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const anthropicClient = new Anthropic();

// N+1: message created per item inside an unbounded loop
async function processMessagesOneByOne(messages: string[]): Promise<void> {
  for (const message of messages) {
    await anthropicClient.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: message }],
    });
  }
}

// Batching opportunity: sequential message creates that could use messageBatches
async function generateTwoMessages(prompt1: string, prompt2: string): Promise<void> {
  const first = await anthropicClient.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt1 }],
  });
  const second = await anthropicClient.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt2 }],
  });
  console.log(first, second);
}

// Missing cache: message created on hot path with no cache guard
async function handleChatMessage(userInput: string): Promise<string> {
  const response = await anthropicClient.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: userInput }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

// ── Stripe ────────────────────────────────────────────────────────────────────

import Stripe from "stripe";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

// N+1: customer retrieved per ID inside an unbounded loop
async function fetchCustomersOneByOne(customerIds: string[]): Promise<void> {
  for (const id of customerIds) {
    await stripeClient.customers.retrieve(id);
  }
}

// Batching opportunity: sequential payment intent creates
async function createTwoPaymentIntents(amount1: number, amount2: number): Promise<void> {
  const first = await stripeClient.paymentIntents.create({
    amount: amount1,
    currency: "usd",
  });
  const second = await stripeClient.paymentIntents.create({
    amount: amount2,
    currency: "usd",
  });
  console.log(first, second);
}

// Missing cache: customer list called inside loop without cursor reuse
async function processAllCustomers(orderIds: string[]): Promise<void> {
  for (const orderId of orderIds) {
    const customers = await stripeClient.customers.list({ limit: 100 });
    console.log(orderId, customers);
  }
}
