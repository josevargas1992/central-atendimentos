// Acesso ao Firestore com as regras de segurança dos dados:
// • Leituras que falham LANÇAM erro — nunca devolvem dados padrão no lugar dos reais.
// • Gravações são sempre de um documento por vez (saveItem/deleteItem) — nada é apagado em massa.
// • Dados padrão só são criados quando o SERVIDOR confirma que a coleção está vazia
//   (uma leitura vazia do cache, sem internet, não conta).
import { collection, doc, getDocs, getDocsFromServer, setDoc, deleteDoc, writeBatch, runTransaction } from "firebase/firestore";

export async function getCol(db, colName) {
  const snap = await getDocs(collection(db, colName));
  return snap.docs.map(d => d.data());
}

// Devolve os documentos da coleção. Se o servidor confirmar que está vazia, chama
// seed(batch) para gravar os dados iniciais e devolve null (o chamador usa os padrões).
export async function loadOrSeed(db, colName, seed) {
  const data = await getCol(db, colName);
  if (data.length) return data;
  const server = await getDocsFromServer(collection(db, colName));
  if (!server.empty) return server.docs.map(d => d.data());
  const batch = writeBatch(db);
  seed(batch);
  await batch.commit();
  return null;
}

export async function saveItem(db, colName, item) {
  await setDoc(doc(db, colName, String(item.id)), item);
}

export async function deleteItem(db, colName, id) {
  await deleteDoc(doc(db, colName, String(id)));
}

// Cria um registro reservando o número dentro de uma transação: se outro atendente gravar
// o mesmo número ao mesmo tempo, o Firestore repete a transação e pega o próximo livre.
// firstId é só um palpite (maior número conhecido + 1); a transação confere no servidor.
export async function createRecord(db, pageId, data, firstId) {
  let id = firstId;
  await runTransaction(db, async tx => {
    while ((await tx.get(doc(db, "records", `${pageId}-${id}`))).exists()) id++;
    tx.set(doc(db, "records", `${pageId}-${id}`), { ...data, id, pageId });
  });
  return id;
}
