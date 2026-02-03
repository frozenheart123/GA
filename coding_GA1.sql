CREATE DATABASE  IF NOT EXISTS `ga_malamart` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `c372-005_team3`;
-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: localhost    Database: ga_malamart
-- ------------------------------------------------------
-- Server version	8.4.5

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `membership_plan`
--

DROP TABLE IF EXISTS `membership_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `membership_plan` (
  `plan_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `discount_type` enum('PERCENT','FLAT') NOT NULL DEFAULT 'PERCENT',
  `discount_value` decimal(10,2) NOT NULL DEFAULT '0.00',
  `min_spent` decimal(10,2) NOT NULL DEFAULT '0.00',
  `duration_days` int NOT NULL DEFAULT '365',
  `is_slider` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`plan_id`),
  UNIQUE KEY `name` (`name`),
  CONSTRAINT `membership_plan_chk_1` CHECK ((`discount_value` >= 0)),
  CONSTRAINT `membership_plan_chk_2` CHECK ((`min_spent` >= 0)),
  CONSTRAINT `membership_plan_chk_3` CHECK ((`duration_days` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `membership_plan`
--

LOCK TABLES `membership_plan` WRITE;
/*!40000 ALTER TABLE `membership_plan` DISABLE KEYS */;
/*!40000 ALTER TABLE `membership_plan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mfa_backup_code`
--

DROP TABLE IF EXISTS `mfa_backup_code`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mfa_backup_code` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_code` (`code_hash`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `mfa_backup_code_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mfa_backup_code`
--

LOCK TABLES `mfa_backup_code` WRITE;
/*!40000 ALTER TABLE `mfa_backup_code` DISABLE KEYS */;
/*!40000 ALTER TABLE `mfa_backup_code` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_item`
--

DROP TABLE IF EXISTS `order_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_item` (
  `order_item_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `line_total` decimal(10,2) NOT NULL,
  PRIMARY KEY (`order_item_id`),
  KEY `idx_oi_order` (`order_id`),
  KEY `idx_oi_product` (`product_id`),
  CONSTRAINT `order_item_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `order_item_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `order_item_chk_1` CHECK ((`quantity` > 0)),
  CONSTRAINT `order_item_chk_2` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `order_item_chk_3` CHECK ((`line_total` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_item`
--

LOCK TABLES `order_item` WRITE;
/*!40000 ALTER TABLE `order_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `contains_membership` tinyint(1) NOT NULL DEFAULT '0',
  `subtotal_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('awaiting_payment','paid','shipped','completed','cancelled','refunded') NOT NULL DEFAULT 'awaiting_payment',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `idx_orders_user` (`user_id`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_created` (`created_at`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `orders_chk_1` CHECK ((`subtotal_amount` >= 0)),
  CONSTRAINT `orders_chk_2` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `orders_chk_3` CHECK ((`total_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment`
--

DROP TABLE IF EXISTS `payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment` (
  `payment_id` bigint NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `user_id` int NOT NULL,
  `method` enum('CARD','COD','PAYPAL') NOT NULL,
  `provider` varchar(50) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'SGD',
  `amount_authorized` decimal(10,2) NOT NULL DEFAULT '0.00',
  `amount_captured` decimal(10,2) NOT NULL DEFAULT '0.00',
  `amount_refunded` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending','requires_action','authorized','captured','failed','cancelled','refunded') NOT NULL DEFAULT 'pending',
  `provider_payment_id` varchar(128) DEFAULT NULL,
  `provider_transaction_id` varchar(128) DEFAULT NULL,
  `statement_descriptor` varchar(22) DEFAULT NULL,
  `card_brand` varchar(20) DEFAULT NULL,
  `card_last4` char(4) DEFAULT NULL,
  `card_exp_month` tinyint DEFAULT NULL,
  `card_exp_year` smallint DEFAULT NULL,
  `three_ds_version` varchar(10) DEFAULT NULL,
  `liability_shifted` tinyint(1) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  KEY `idx_payment_order` (`order_id`),
  KEY `idx_payment_user` (`user_id`),
  KEY `idx_payment_status` (`status`),
  KEY `idx_payment_provider_payment` (`provider`,`provider_payment_id`),
  KEY `idx_payment_provider_tx` (`provider`,`provider_transaction_id`),
  CONSTRAINT `payment_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `payment_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `payment_chk_1` CHECK (((`amount_authorized` >= 0) and (`amount_captured` >= 0) and (`amount_refunded` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment`
--

LOCK TABLES `payment` WRITE;
/*!40000 ALTER TABLE `payment` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `nets_transactions`
--

DROP TABLE IF EXISTS `nets_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nets_transactions` (
  `nets_transaction_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `txn_retrieval_ref` varchar(128) NOT NULL,
  `net_transaction_id` varchar(128) DEFAULT NULL,
  `course_init_id` varchar(128) DEFAULT NULL,
  `status` enum('pending','success','failed','timeout') NOT NULL DEFAULT 'pending',
  `response_code` varchar(10) DEFAULT NULL,
  `network_status` tinyint DEFAULT NULL,
  `payload` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`nets_transaction_id`),
  UNIQUE KEY `uq_nets_txn_ref` (`txn_retrieval_ref`),
  KEY `idx_nets_user_id` (`user_id`),
  KEY `idx_nets_order_id` (`order_id`),
  CONSTRAINT `fk_nets_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_nets_transactions_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nets_transactions`
--

LOCK TABLES `nets_transactions` WRITE;
/*!40000 ALTER TABLE `nets_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `nets_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_method`
--

DROP TABLE IF EXISTS `payment_method`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_method` (
  `payment_method_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `method` enum('CARD','COD','PAYPAL') NOT NULL,
  `provider` varchar(50) NOT NULL,
  `provider_pm_token` varchar(128) NOT NULL,
  `card_brand` varchar(20) DEFAULT NULL,
  `card_last4` char(4) DEFAULT NULL,
  `card_exp_month` tinyint DEFAULT NULL,
  `card_exp_year` smallint DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_method_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `payment_method_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_method`
--

LOCK TABLES `payment_method` WRITE;
/*!40000 ALTER TABLE `payment_method` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_method` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product`
--

DROP TABLE IF EXISTS `product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product` (
  `product_id` int NOT NULL AUTO_INCREMENT,
  `product_type` varchar(50) NOT NULL DEFAULT 'goods',
  `name` varchar(100) NOT NULL,
  `information` text,
  `quantity` int NOT NULL DEFAULT '0',
  `price` decimal(10,2) NOT NULL,
  `image` varchar(255) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  KEY `idx_product_type` (`product_type`),
  KEY `idx_product_name` (`name`),
  CONSTRAINT `product_chk_1` CHECK ((`quantity` >= 0)),
  CONSTRAINT `product_chk_2` CHECK ((`price` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product`
--

LOCK TABLES `product` WRITE;
/*!40000 ALTER TABLE `product` DISABLE KEYS */;
INSERT INTO `product` VALUES (5,'meat','ss','11',11,11.00,'/images/ss.jpg',0,1,'2025-12-01 08:39:35','2025-12-01 08:39:35');
/*!40000 ALTER TABLE `product` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refund`
--

DROP TABLE IF EXISTS `refund`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refund` (
  `refund_id` bigint NOT NULL AUTO_INCREMENT,
  `payment_id` bigint NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending','succeeded','failed','cancelled') NOT NULL DEFAULT 'pending',
  `provider_refund_id` varchar(128) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`refund_id`),
  KEY `payment_id` (`payment_id`),
  CONSTRAINT `refund_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payment` (`payment_id`) ON DELETE CASCADE,
  CONSTRAINT `refund_chk_1` CHECK ((`amount` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refund`
--

LOCK TABLES `refund` WRITE;
/*!40000 ALTER TABLE `refund` DISABLE KEYS */;
/*!40000 ALTER TABLE `refund` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refund_item`
--

DROP TABLE IF EXISTS `refund_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refund_item` (
  `refund_item_id` bigint NOT NULL AUTO_INCREMENT,
  `refund_id` bigint NOT NULL,
  `order_item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  PRIMARY KEY (`refund_item_id`),
  KEY `idx_refund_item_refund` (`refund_id`),
  KEY `idx_refund_item_order_item` (`order_item_id`),
  CONSTRAINT `refund_item_ibfk_1` FOREIGN KEY (`refund_id`) REFERENCES `refund` (`refund_id`) ON DELETE CASCADE,
  CONSTRAINT `refund_item_ibfk_2` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`) ON DELETE RESTRICT,
  CONSTRAINT `refund_item_chk_1` CHECK ((`quantity` > 0)),
  CONSTRAINT `refund_item_chk_2` CHECK ((`amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refund_item`
--

LOCK TABLES `refund_item` WRITE;
/*!40000 ALTER TABLE `refund_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `refund_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_cart_items`
--

DROP TABLE IF EXISTS `user_cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_cart_items` (
  `cart_item_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cart_item_id`),
  UNIQUE KEY `uq_cart_user_product` (`user_id`,`product_id`),
  KEY `idx_cart_user` (`user_id`),
  KEY `idx_cart_product` (`product_id`),
  CONSTRAINT `fk_cart_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cart_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `user_cart_items_chk_1` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_cart_items`
--

LOCK TABLES `user_cart_items` WRITE;
/*!40000 ALTER TABLE `user_cart_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `role` enum('admin','user') NOT NULL DEFAULT 'user',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `name` varchar(100) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `contact_number` varchar(20) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `is_member` tinyint(1) NOT NULL DEFAULT '0',
  `plan_id` int DEFAULT NULL,
  `member_since` date DEFAULT NULL,
  `member_expires` date DEFAULT NULL,
  `mfa_totp_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `mfa_totp_secret_enc` varbinary(255) DEFAULT NULL,
  `mfa_totp_iv` varbinary(16) DEFAULT NULL,
  `mfa_totp_tag` varbinary(16) DEFAULT NULL,
  `mfa_recovery_remaining` int NOT NULL DEFAULT '0',
  `failed_login_count` int NOT NULL DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `pdpa_consent` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_contact` (`contact_number`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_plan` (`plan_id`),
  CONSTRAINT `fk_users_plan` FOREIGN KEY (`plan_id`) REFERENCES `membership_plan` (`plan_id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `users_chk_1` CHECK ((`is_member` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','active','nelson','woodland','123321@gmail.com','12334567','$2b$10$qPWofls5vjX1dgA62JLbd.SkVr6hj5QL7ltHwaGpgH.ie9ODSw6OS',1,NULL,'2025-12-01','2026-12-01',1,_binary '�Z�\�t\���\�\�Tr�q Cbs~>�o\�_]���',_binary '���\n\�Z\� r��',_binary '�si\�˪�=L�\�',0,0,NULL,NULL,0,'2025-12-01 08:37:41','2025-12-01 08:40:14',NULL,'/images/1764549546970-images__1_.jpeg'),(2,'user','active','liew','woodland','liew@local','98590528','$2b$10$rfkGBYM6ZBXjbDM37RSF/enEhn7eLRy4IC3Pe8lnMcXGOY337fiei',0,NULL,NULL,NULL,1,_binary 'Eڠ�&u��8�H\�uX�{���}~\�.mQ�E\�!�N',_binary '�@�D>�\�֖y',_binary '��0d\�A\�!��l��',0,0,NULL,NULL,0,'2025-12-01 08:39:47','2025-12-02 10:06:17',NULL,'/images/1764641065769-download.jpeg');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-02 13:58:58
DROP TABLE IF EXISTS paynow_invoice;

ALTER TABLE payment
  DROP COLUMN paynow_reference,
  DROP COLUMN paynow_qr_url,
  DROP COLUMN paynow_expires_at,
  MODIFY method ENUM('CARD','COD') NOT NULL;

ALTER TABLE payment_method
  MODIFY method ENUM('CARD','COD') NOT NULL;
ALTER TABLE product
  ADD COLUMN is_slider TINYINT(1) NOT NULL DEFAULT 0;
UPDATE product SET is_slider = 0;

-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: c372-005.mysql.database.azure.com    Database: c372-005_team3
-- ------------------------------------------------------
-- Server version	8.0.42-azure

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orderId` varchar(100) NOT NULL,
  `payerId` varchar(100) DEFAULT NULL,
  `payerEmail` varchar(255) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `time` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `captureId` varchar(255) DEFAULT NULL,
  `refundReason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-03  7:58:08

ALTER TABLE transactions
  ADD COLUMN captureId VARCHAR(255) DEFAULT NULL,
  ADD COLUMN refundReason VARCHAR(255) DEFAULT NULL;

ALTER TABLE orders ADD COLUMN payment_method VARCHAR(50) DEFAULT NULL;

-- Add captureId column if it doesn't exist
ALTER TABLE transactions 
ADD COLUMN captureId VARCHAR(255) DEFAULT NULL;

-- Add refundReason column if it doesn't exist
ALTER TABLE transactions 
ADD COLUMN refundReason VARCHAR(255) DEFAULT NULL;

-- Verify the changes
DESCRIBE transactions;
