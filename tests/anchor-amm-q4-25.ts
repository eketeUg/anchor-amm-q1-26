import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";
import { expect } from "chai";
import {
  createMint,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  mintTo,
} from "@solana/spl-token";

describe("anchor-amm-q4-25", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anchorAmmQ425 as Program<AnchorAmmQ425>;
  const connection = provider.connection;

  // Config params
  const seed = new anchor.BN(1234);
  const fee = 30;
  const authority = provider.wallet.publicKey;
  const user = provider.wallet.publicKey;

  // PDAs
  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
    program.programId,
  );

  const [mintLpPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), configPda.toBuffer()],
    program.programId,
  );

  // Accounts
  let mintX: anchor.web3.PublicKey;
  let mintY: anchor.web3.PublicKey;
  let vaultX: anchor.web3.PublicKey;
  let vaultY: anchor.web3.PublicKey;
  let userX: anchor.web3.PublicKey;
  let userY: anchor.web3.PublicKey;
  let userLp: anchor.web3.PublicKey;

  console.log(`User: ${user.toString()}`);
  console.log(`Config PDA: ${configPda.toString()}`);
  console.log(`LP Mint PDA: ${mintLpPda.toString()}`);

  before(async () => {
    await connection.requestAirdrop(user, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    mintX = await createMint(
      connection,
      provider.wallet.payer,
      authority,
      null,
      6,
    );
    mintY = await createMint(
      connection,
      provider.wallet.payer,
      authority,
      null,
      6,
    );

    vaultX = getAssociatedTokenAddressSync(mintX, configPda, true);
    vaultY = getAssociatedTokenAddressSync(mintY, configPda, true);

    userX = getAssociatedTokenAddressSync(mintX, user);
    userY = getAssociatedTokenAddressSync(mintY, user);
    userLp = getAssociatedTokenAddressSync(mintLpPda, user);

    const createAtasTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(user, userX, user, mintX),
      createAssociatedTokenAccountInstruction(user, userY, user, mintY),
    );
    await provider.sendAndConfirm(createAtasTx);

    await mintTo(
      connection,
      provider.wallet.payer,
      mintX,
      userX,
      provider.wallet.payer,
      1_000,
    );
    await mintTo(
      connection,
      provider.wallet.payer,
      mintY,
      userY,
      provider.wallet.payer,
      1_000,
    );
  });

  describe("Initialize", () => {
    it("Initialize AMM", async () => {
      const tx = await program.methods
        .initialize(seed, fee, authority)
        .accountsStrict({
          initializer: authority,
          mintX,
          mintY,
          mintLp: mintLpPda,
          vaultX,
          vaultY,
          config: configPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`Initialize tx: ${tx}`);
    });
  });

  describe("Deposit", () => {
    it("Deposit liquidity", async () => {
      const lpToMint = new anchor.BN(100);
      const maxX = new anchor.BN(500);
      const maxY = new anchor.BN(500);

      const userXBefore = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYBefore = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXBefore = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYBefore = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      await program.methods
        .deposit(lpToMint, maxX, maxY)
        .accountsStrict({
          user,
          mintX,
          mintY,
          config: configPda,
          mintLp: mintLpPda,
          vaultX,
          vaultY,
          userX,
          userY,
          userLp,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const userXAfter = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYAfter = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXAfter = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYAfter = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      expect(vaultXAfter).to.be.greaterThan(vaultXBefore);
      expect(vaultYAfter).to.be.greaterThan(vaultYBefore);
      expect(userXAfter).to.be.lessThan(userXBefore);
      expect(userYAfter).to.be.lessThan(userYBefore);
    });
  });

  describe("Swap", () => {
    it("Swap X → Y", async () => {
      const amountIn = new anchor.BN(200);
      const minOut = new anchor.BN(1);

      const userXBefore = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYBefore = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXBefore = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYBefore = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      await program.methods
        .swap(true, amountIn, minOut)
        .accountsStrict({
          user,
          mintX,
          mintY,
          config: configPda,
          vaultX,
          vaultY,
          userX,
          userY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const userXAfter = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYAfter = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXAfter = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYAfter = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      expect(userXAfter).to.be.lessThan(userXBefore);
      expect(userYAfter).to.be.greaterThan(userYBefore);
      expect(vaultXAfter).to.be.greaterThan(vaultXBefore);
      expect(vaultYAfter).to.be.lessThan(vaultYBefore);
    });

    it("Swap Y → X", async () => {
      const amountIn = new anchor.BN(100);
      const minOut = new anchor.BN(1);

      const userXBefore = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYBefore = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXBefore = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYBefore = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      await program.methods
        .swap(false, amountIn, minOut)
        .accountsStrict({
          user,
          mintX,
          mintY,
          config: configPda,
          vaultX,
          vaultY,
          userX,
          userY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const userXAfter = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYAfter = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXAfter = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYAfter = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      expect(userXAfter).to.be.greaterThan(userXBefore);
      expect(userYAfter).to.be.lessThan(userYBefore);
      expect(vaultXAfter).to.be.lessThan(vaultXBefore);
      expect(vaultYAfter).to.be.greaterThan(vaultYBefore);
    });
  });

  describe("Withdraw", () => {
    it("Withdraw liquidity", async () => {
      const amount = new anchor.BN(10);
      const minX = new anchor.BN(1);
      const minY = new anchor.BN(1);

      const userXBefore = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYBefore = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXBefore = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYBefore = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      await program.methods
        .withdraw(amount, minX, minY)
        .accountsStrict({
          user,
          mintX,
          mintY,
          config: configPda,
          mintLp: mintLpPda,
          vaultX,
          vaultY,
          userX,
          userY,
          userLp,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const userXAfter = (await connection.getTokenAccountBalance(userX)).value
        .uiAmount;
      const userYAfter = (await connection.getTokenAccountBalance(userY)).value
        .uiAmount;
      const vaultXAfter = (await connection.getTokenAccountBalance(vaultX))
        .value.uiAmount;
      const vaultYAfter = (await connection.getTokenAccountBalance(vaultY))
        .value.uiAmount;

      expect(vaultXAfter).to.be.lessThan(vaultXBefore);
      expect(vaultYAfter).to.be.lessThan(vaultYBefore);
      expect(userXAfter).to.be.greaterThan(userXBefore);
      expect(userYAfter).to.be.greaterThan(userYBefore);
    });
  });
});
