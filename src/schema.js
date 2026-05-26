export const typeDefs = `#graphql
  type User {
    id: ID!
    username: String!
    balance: Int!
    createdAt: String!
    updatedAt: String!
  }

  type Transaction {
    id: ID!
    userId: String!
    type: String!
    amount: Int!
    balanceBefore: Int!
    balanceAfter: Int!
    requestId: String!
    createdAt: String!
  }

  type Query {
    user(id: ID!): User
    transactions(userId: ID!): [Transaction!]!
  }

  type Mutation {
    createUser(username: String!, balance: Int!): User!

    bet(
      userId: ID!
      amount: Int!
      requestId: String!
    ): User!

    payout(
      userId: ID!
      amount: Int!
      requestId: String!
    ): User!
  }
`;