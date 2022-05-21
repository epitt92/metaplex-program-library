#![cfg(feature = "test-bpf")]
pub mod utils;

use borsh::BorshDeserialize;
use mpl_token_metadata::{error::MetadataError, state::CollectionDetails};
use mpl_token_metadata::{
    instruction::{approve_collection_authority, set_collection_size},
    state::Metadata as ProgramMetadata,
    ID as PROGRAM_ID,
};
use num_traits::FromPrimitive;
use solana_program_test::*;
use solana_sdk::{
    instruction::InstructionError,
    signature::Keypair,
    signer::Signer,
    transaction::{Transaction, TransactionError},
    transport::TransportError,
};
use utils::*;

mod set_collection_size {

    use mpl_token_metadata::pda::find_collection_authority_account;

    use super::*;

    #[tokio::test]
    async fn collection_authority_successfully_updates_size() {
        let mut context = program_test().start_with_context().await;

        // Create a Collection Parent NFT with the CollectionDetails struct populated
        let collection_parent_nft = Metadata::new();
        collection_parent_nft
            .create_v3(
                &mut context,
                "Test".to_string(),
                "TST".to_string(),
                "uri".to_string(),
                None,
                10,
                false,
                None,
                None,
                None,
                true, // is collection parent
            )
            .await
            .unwrap();
        let parent_master_edition_account = MasterEditionV2::new(&collection_parent_nft);
        parent_master_edition_account
            .create_v3(&mut context, Some(0))
            .await
            .unwrap();

        let current_size = 0;
        let new_size = 11235;

        let md_account = context
            .banks_client
            .get_account(collection_parent_nft.pubkey)
            .await
            .unwrap()
            .unwrap();

        let metadata = ProgramMetadata::deserialize(&mut md_account.data.as_slice()).unwrap();
        let retrieved_size = if let CollectionDetails::CollectionDetailsV1 { status: _, size } =
            metadata.collection_details
        {
            size
        } else {
            panic!("Expected CollectionDetails::CollectionDetailsV1");
        };

        assert_eq!(retrieved_size, current_size);

        let ix = set_collection_size(
            PROGRAM_ID,
            collection_parent_nft.pubkey,
            context.payer.pubkey(),
            collection_parent_nft.mint.pubkey(),
            None,
            new_size,
        );

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(tx).await.unwrap();
        let md_account = context
            .banks_client
            .get_account(collection_parent_nft.pubkey)
            .await
            .unwrap()
            .unwrap();

        let metadata = ProgramMetadata::deserialize(&mut md_account.data.as_slice()).unwrap();
        let retrieved_size = if let CollectionDetails::CollectionDetailsV1 { status: _, size } =
            metadata.collection_details
        {
            size
        } else {
            panic!("Expected CollectionDetails::CollectionDetailsV1");
        };

        assert_eq!(retrieved_size, new_size);
    }

    #[tokio::test]
    async fn delegate_authority_successfully_updates_size() {
        let mut context = program_test().start_with_context().await;

        // Create a Collection Parent NFT with the CollectionDetails struct populated
        let collection_parent_nft = Metadata::new();
        collection_parent_nft
            .create_v3(
                &mut context,
                "Test".to_string(),
                "TST".to_string(),
                "uri".to_string(),
                None,
                10,
                false,
                None,
                None,
                None,
                true, // is collection parent
            )
            .await
            .unwrap();
        let parent_master_edition_account = MasterEditionV2::new(&collection_parent_nft);
        parent_master_edition_account
            .create_v3(&mut context, Some(0))
            .await
            .unwrap();

        // Approve a delegate collection authority.
        let delegate = Keypair::new();

        // Derive collection authority record.
        let (collection_authority_record, _) = find_collection_authority_account(
            &collection_parent_nft.mint.pubkey(),
            &delegate.pubkey(),
        );

        let ix = approve_collection_authority(
            PROGRAM_ID,
            collection_authority_record,
            delegate.pubkey(),
            context.payer.pubkey(),
            context.payer.pubkey(),
            collection_parent_nft.pubkey,
            collection_parent_nft.mint.pubkey(),
        );

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(tx).await.unwrap();

        let current_size = 0;
        let new_size = 11235;

        let md_account = context
            .banks_client
            .get_account(collection_parent_nft.pubkey)
            .await
            .unwrap()
            .unwrap();

        let metadata = ProgramMetadata::deserialize(&mut md_account.data.as_slice()).unwrap();
        let retrieved_size = if let CollectionDetails::CollectionDetailsV1 { status: _, size } =
            metadata.collection_details
        {
            size
        } else {
            panic!("Expected CollectionDetails::CollectionDetailsV1");
        };

        assert_eq!(retrieved_size, current_size);

        let ix = set_collection_size(
            PROGRAM_ID,
            collection_parent_nft.pubkey,
            context.payer.pubkey(),
            collection_parent_nft.mint.pubkey(),
            None,
            new_size,
        );

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(tx).await.unwrap();
        let md_account = context
            .banks_client
            .get_account(collection_parent_nft.pubkey)
            .await
            .unwrap()
            .unwrap();

        let metadata = ProgramMetadata::deserialize(&mut md_account.data.as_slice()).unwrap();
        let retrieved_size = if let CollectionDetails::CollectionDetailsV1 { status: _, size } =
            metadata.collection_details
        {
            size
        } else {
            panic!("Expected CollectionDetails::CollectionDetailsV1");
        };

        assert_eq!(retrieved_size, new_size);
    }

    #[tokio::test]
    async fn invalid_metadata_account() {
        // Submit a tx with a metadata account not owned by the token-metadata program.
        // This should fail with IncorrectOwner error.
        let mut context = program_test().start_with_context().await;

        // Create a Collection Parent NFT with the CollectionDetails struct populated
        let collection_parent_nft = Metadata::new();
        collection_parent_nft
            .create_v3(
                &mut context,
                "Test".to_string(),
                "TST".to_string(),
                "uri".to_string(),
                None,
                10,
                false,
                None,
                None,
                None,
                true, // is collection parent
            )
            .await
            .unwrap();
        let parent_master_edition_account = MasterEditionV2::new(&collection_parent_nft);
        parent_master_edition_account
            .create_v3(&mut context, Some(0))
            .await
            .unwrap();

        let new_size = 11235;

        let fake_metadata = Keypair::new();

        let ix = set_collection_size(
            PROGRAM_ID,
            fake_metadata.pubkey(),
            context.payer.pubkey(),
            collection_parent_nft.mint.pubkey(),
            None,
            new_size,
        );
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            context.last_blockhash,
        );

        let err = context
            .banks_client
            .process_transaction(tx)
            .await
            .unwrap_err();

        assert_custom_error!(err, MetadataError::IncorrectOwner);
    }
}