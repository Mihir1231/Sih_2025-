import chromadb
client = chromadb.PersistentClient(path="D:/LDRP ITR/backend/chromadb_data/student_visitor")

# See what collections you have
print(client.list_collections())

# Inspect the visitor collection
visitor_collection = client.get_collection("documents")
print(visitor_collection.get()) # This will show you all documents inside