// src/index.js

import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import bodyParser from 'body-parser';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const app = express();

app.use(cors());
app.use(bodyParser.json());

/*
|--------------------------------------------------------------------------
| GraphQL Schema
|--------------------------------------------------------------------------
*/

const typeDefs = `#graphql

  type User {
    id: Int!
    userId: Int!
    environment: String!
    username: String!
    balance: Float!
    createdAt: String!
  }

  type Query {
    user(
      userId: Int!
      environment: String!
    ): User

    users: [User!]!
  }

  type Mutation {

    addBalance(
      userId: Int!
      amount: Float!
      environment: String!
    ): User!

    deductBalance(
      userId: Int!
      amount: Float!
      environment: String!
    ): User!

    clearBalance(
      userId: Int!
      environment: String!
    ): User!

  }

`;

const resolvers = {

  Query: {

    users: async () => {
      return await prisma.user.findMany();
    },

    user: async (_, { userId, environment }) => {

      return await prisma.user.findUnique({
        where: {
          userId_environment: {
            userId,
            environment
          }
        }
      });

    }

  },

  Mutation: {

    addBalance: async (_, {
      userId,
      amount,
      environment
    }) => {

      return await prisma.user.upsert({

        where: {
          userId_environment: {
            userId,
            environment
          }
        },

        update: {
          balance: {
            increment: amount
          }
        },

        create: {
          userId,
          environment,
          username: `user_${userId}`,
          balance: amount
        }

      });

    },

    deductBalance: async (_, {
      userId,
      amount,
      environment
    }) => {

      const user = await prisma.user.findUnique({
        where: {
          userId_environment: {
            userId,
            environment
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.balance < amount) {
        throw new Error('Insufficient balance');
      }

      return await prisma.user.update({

        where: {
          userId_environment: {
            userId,
            environment
          }
        },

        data: {
          balance: {
            decrement: amount
          }
        }

      });

    },

    clearBalance: async (_, {
      userId,
      environment
    }) => {

      return await prisma.user.update({

        where: {
          userId_environment: {
            userId,
            environment
          }
        },

        data: {
          balance: 0
        }

      });

    }

  }

};

/*
|--------------------------------------------------------------------------
| Apollo Server (PRIVATE ONLY)
|--------------------------------------------------------------------------
*/

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
});

await apolloServer.start();

/*
|--------------------------------------------------------------------------
| INTERNAL GRAPHQL EXECUTOR
|--------------------------------------------------------------------------
*/

const executeOperation = async (query, variables = {}) => {

  const result = await apolloServer.executeOperation({
    query,
    variables
  });

  if (result.body.kind === 'single') {

    const singleResult = result.body.singleResult;

    if (singleResult.errors) {
      throw new Error(singleResult.errors[0].message);
    }

    return singleResult.data;
  }

  throw new Error('GraphQL execution failed');

};

/*
|--------------------------------------------------------------------------
| REST API ENDPOINTS
|--------------------------------------------------------------------------
*/

/**
 * LOGIN
 * POST /dev/api/v1/user/login
 */
app.post('/dev/api/v1/user/login', async (req, res) => {

  try {

    const {
      userId,
      environment = 'dev'
    } = req.body;

    let data = await executeOperation(

      `
      query GetUser($userId: Int!, $environment: String!) {
        user(userId: $userId, environment: $environment) {
          id
          userId
          username
          balance
          environment
          createdAt
        }
      }
      `,

      {
        userId,
        environment
      }

    );

    if (!data.user) {

      data = await executeOperation(

        `
        mutation AddBalance(
          $userId: Int!,
          $amount: Float!,
          $environment: String!
        ) {
          addBalance(
            userId: $userId,
            amount: $amount,
            environment: $environment
          ) {
            id
            userId
            username
            balance
            environment
            createdAt
          }
        }
        `,

        {
          userId,
          amount: 0,
          environment
        }

      );

      return res.json({
        success: true,
        user: data.addBalance
      });

    }

    return res.json({
      success: true,
      user: data.user
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }

});

/**
 * BALANCE
 * POST /dev/api/v1/wallet/balance
 */
app.post('/dev/api/v1/wallet/balance', async (req, res) => {

  try {

    const {
      userId,
      environment = 'dev'
    } = req.body;

    const data = await executeOperation(

      `
      query GetUser($userId: Int!, $environment: String!) {
        user(userId: $userId, environment: $environment) {
          userId
          username
          balance
          environment
        }
      }
      `,

      {
        userId,
        environment
      }

    );

    return res.json({
      success: true,
      data: data.user
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }

});

/**
 * BET
 * POST /dev/api/v1/wallet/bet
 */
app.post('/dev/api/v1/wallet/bet', async (req, res) => {

  try {

    const {
      userId,
      amount,
      environment = 'dev'
    } = req.body;

    const data = await executeOperation(

      `
      mutation DeductBalance(
        $userId: Int!,
        $amount: Float!,
        $environment: String!
      ) {
        deductBalance(
          userId: $userId,
          amount: $amount,
          environment: $environment
        ) {
          userId
          username
          balance
          environment
        }
      }
      `,

      {
        userId,
        amount,
        environment
      }

    );

    return res.json({
      success: true,
      data: data.deductBalance
    });

  } catch (err) {

    return res.status(400).json({
      success: false,
      message: err.message
    });

  }

});

/**
 * PAYOUT
 * POST /dev/api/v1/wallet/payout
 */
app.post('/dev/api/v1/wallet/payout', async (req, res) => {

  try {

    const {
      userId,
      amount,
      environment = 'dev'
    } = req.body;

    const data = await executeOperation(

      `
      mutation AddBalance(
        $userId: Int!,
        $amount: Float!,
        $environment: String!
      ) {
        addBalance(
          userId: $userId,
          amount: $amount,
          environment: $environment
        ) {
          userId
          username
          balance
          environment
        }
      }
      `,

      {
        userId,
        amount,
        environment
      }

    );

    return res.json({
      success: true,
      data: data.addBalance
    });

  } catch (err) {

    return res.status(400).json({
      success: false,
      message: err.message
    });

  }

});

/**
 * ROLLBACK
 * POST /dev/api/v1/wallet/rollback
 */
app.post('/dev/api/v1/wallet/rollback', async (req, res) => {

  try {

    const {
      userId,
      amount,
      environment = 'dev'
    } = req.body;

    const data = await executeOperation(

      `
      mutation AddBalance(
        $userId: Int!,
        $amount: Float!,
        $environment: String!
      ) {
        addBalance(
          userId: $userId,
          amount: $amount,
          environment: $environment
        ) {
          userId
          username
          balance
          environment
        }
      }
      `,

      {
        userId,
        amount,
        environment
      }

    );

    return res.json({
      success: true,
      data: data.addBalance
    });

  } catch (err) {

    return res.status(400).json({
      success: false,
      message: err.message
    });

  }

});



/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 REST API running on port ${PORT}`);
});