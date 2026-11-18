import { describe, expect, it } from "vitest";
import { caminhoNoCofre, nomeSeguro, tamanhoLegivel, tipoDoArquivo } from "./arquivos";

describe("tipo do arquivo", () => {
  it("aceita os tipos conhecidos", () => {
    expect(tipoDoArquivo("contrato.pdf", "application/pdf")).toBe("application/pdf");
    expect(tipoDoArquivo("foto.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(tipoDoArquivo("notas.txt", "text/plain; charset=utf-8")).toBe("text/plain");
  });
  it("usa a extensão quando o tipo vem genérico", () => {
    expect(tipoDoArquivo("relatorio.docx", "application/octet-stream")).toContain("wordprocessingml");
    expect(tipoDoArquivo("ideias.md", "")).toBe("text/markdown");
    expect(tipoDoArquivo("IMG_1.HEIC", null)).toBe("image/heic");
  });
  it("recusa o que não sabe ler", () => {
    expect(tipoDoArquivo("programa.exe", "application/x-msdownload")).toBeNull();
    expect(tipoDoArquivo("planilha.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBeNull();
    expect(tipoDoArquivo("video.mp4", "video/mp4")).toBeNull();
    // extensão de PDF não "disfarça" um executável
    expect(tipoDoArquivo("virus.pdf", "application/x-msdownload")).toBeNull();
  });
});

describe("nome e caminho no cofre", () => {
  it("limpa nomes perigosos", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("passwd");
    expect(nomeSeguro("Contrato de Aluguel – São Paulo.pdf")).toBe("Contrato-de-Aluguel-Sao-Paulo.pdf");
    expect(nomeSeguro("...")).toBe("arquivo");
  });
  it("sempre fica na pasta da pessoa", () => {
    const c = caminhoNoCofre("u-1", "../outro/x.pdf", "abc");
    expect(c).toBe("u-1/site/abc-x.pdf");
    expect(caminhoNoCofre("u-1", "foto.jpg", "id", "whatsapp")).toBe("u-1/whatsapp/id-foto.jpg");
  });
  it("mostra o tamanho legível", () => {
    expect(tamanhoLegivel(500)).toBe("500 B");
    expect(tamanhoLegivel(2048)).toBe("2 KB");
    expect(tamanhoLegivel(3 * 1024 * 1024)).toBe("3,0 MB");
  });
});
