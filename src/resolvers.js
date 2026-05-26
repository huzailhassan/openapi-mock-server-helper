import { prisma } from "./db.js";

export const resolvers = {
  Query: {
    user: async (_, { id }) => {
      return prisma.user.findUnique({
        where: { id }
      });
    },

    transactions: async (_, { userId }) => {
      return prisma.transaction.findMany({
        where: { userId },
        orderBy: {
          createdAt: "desc"
        }
      });
    }
  },

  Mutation: {
    createUser: async (_, { username, balance }) => {
      return prisma.user.create({
        data: {
          username,
          balance
        }
      });
    },

    bet: async (_, { userId, amount, requestId }) => {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.transaction.findUnique({
          where: { requestId }
        });

        if (existing) {
          throw new Error("Duplicate requestId");
        }

        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!user) {
          throw new Error("User not found");
        }

        if (amount <= 0) {
          throw new Error("Invalid amount");
        }

        if (user.balance < amount) {
          throw new Error("Insufficient balance");
        }

        const newBalance = user.balance - amount;

        await tx.user.update({
          where: { id: userId },
          data: {
            balance: newBalance
          }
        });

        await tx.transaction.create({
          data: {
            userId,
            type: "BET",
            amount,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            requestId
          }
        });

        return tx.user.findUnique({
          where: { id: userId }
        });
      });
    },

    payout: async (_, { userId, amount, requestId }) => {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.transaction.findUnique({
          where: { requestId }
        });

        if (existing) {
          throw new Error("Duplicate requestId");
        }

        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!user) {
          throw new Error("User not found");
        }

        if (amount <= 0) {
          throw new Error("Invalid amount");
        }

        const newBalance = user.balance + amount;

        await tx.user.update({
          where: { id: userId },
          data: {
            balance: newBalance
          }
        });

        await tx.transaction.create({
          data: {
            userId,
            type: "PAYOUT",
            amount,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            requestId
          }
        });

        return tx.user.findUnique({
          where: { id: userId }
        });
      });
    }
  }
};